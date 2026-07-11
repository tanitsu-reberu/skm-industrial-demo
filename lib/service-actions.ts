"use server";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions";
import { getCurrentUser, hasAdminPanelAccess } from "@/lib/auth";
import { dbGet, dbRun } from "@/lib/db";
import type { DbServiceRow } from "@/lib/services-db";
import { serviceCategories } from "@/lib/services";
import { extensionForMime, getUploadsDir, isAllowedImageType, MAX_UPLOAD_BYTES } from "@/lib/uploads";

async function requireAdmin() {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return null;
  if (!(await hasAdminPanelAccess(admin.id))) return null;
  return admin;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const publicCategories = serviceCategories.filter((category) => category !== "Все");

const serviceSchema = z.object({
  id: z.coerce.number().int().nonnegative().optional(),
  title: z.string().trim().min(3, "Название минимум 3 символа").max(200),
  category: z.string().refine((value) => publicCategories.includes(value as never), "Неизвестная категория"),
  shortDescription: z.string().trim().min(10, "Краткое описание минимум 10 символов").max(300),
  description: z.string().trim().min(20, "Полное описание минимум 20 символов").max(5000),
  price: z.coerce.number().int().min(0).max(100_000_000),
  priceUnit: z.string().trim().max(60).default(""),
  estimatedDuration: z.string().trim().max(120).default(""),
  image: z.string().trim().max(500).default(""),
  gallery: z.string().default("[]"),
  included: z.string().default(""),
  seoTitle: z.string().trim().max(200).default(""),
  seoDescription: z.string().trim().max(400).default(""),
  seoKeywords: z.string().trim().max(400).default(""),
  isActive: z.coerce.boolean().default(true),
  slug: z.string().trim().max(90).default(""),
});

export type SaveServiceResult = ActionResult & { serviceId?: number; slug?: string };

function revalidateCatalog(slug?: string) {
  revalidatePath("/");
  revalidatePath("/services");
  revalidatePath("/sitemap.xml");
  if (slug) {
    revalidatePath(`/services/${slug}`);
    revalidatePath(`/checkout/${slug}`);
  }
}

export async function adminSaveServiceAction(formData: FormData): Promise<SaveServiceResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const parsed = serviceSchema.safeParse({
    id: formData.get("id") ?? undefined,
    title: formData.get("title"),
    category: formData.get("category"),
    shortDescription: formData.get("shortDescription"),
    description: formData.get("description"),
    price: formData.get("price"),
    priceUnit: formData.get("priceUnit") ?? "",
    estimatedDuration: formData.get("estimatedDuration") ?? "",
    image: formData.get("image") ?? "",
    gallery: formData.get("gallery") ?? "[]",
    included: formData.get("included") ?? "",
    seoTitle: formData.get("seoTitle") ?? "",
    seoDescription: formData.get("seoDescription") ?? "",
    seoKeywords: formData.get("seoKeywords") ?? "",
    isActive: formData.get("isActive") === "true",
    slug: formData.get("slug") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  const data = parsed.data;

  let gallery: string[] = [];
  try {
    const raw = JSON.parse(data.gallery);
    gallery = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
  } catch {
    gallery = [];
  }

  const included = data.included
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  let slug = data.slug ? slugify(data.slug) : slugify(data.title);
  if (!slug) slug = `usluga-${Date.now()}`;

  const existingWithSlug = await dbGet<DbServiceRow>("SELECT id FROM services WHERE slug = ?", [slug]);
  if (existingWithSlug && existingWithSlug.id !== data.id) {
    slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;
  }

  const isUpdate = Boolean(data.id && data.id > 0);

  if (isUpdate) {
    const existing = await dbGet<DbServiceRow>("SELECT * FROM services WHERE id = ?", [data.id!]);
    if (!existing) return { ok: false, message: "Услуга не найдена" };

    await dbRun(
      `UPDATE services SET
        slug = ?, title = ?, short_description = ?, description = ?, price = ?, price_unit = ?,
        category = ?, estimated_duration = ?, image = ?, gallery = ?, included = ?,
        seo_title = ?, seo_description = ?, seo_keywords = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        slug, data.title, data.shortDescription, data.description, data.price, data.priceUnit,
        data.category, data.estimatedDuration, data.image, JSON.stringify(gallery), JSON.stringify(included),
        data.seoTitle, data.seoDescription, data.seoKeywords, data.isActive ? 1 : 0,
        data.id!,
      ],
    );

    revalidateCatalog(slug);
    if (existing.slug !== slug) revalidateCatalog(existing.slug);
    return { ok: true, message: "Услуга обновлена", serviceId: data.id, slug };
  }

  const maxSort = await dbGet<{ max_sort: number }>("SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM services");

  const result = await dbRun(
    `INSERT INTO services
      (slug, title, short_description, description, price, price_unit, category, estimated_duration,
       image, gallery, included, seo_title, seo_description, seo_keywords, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug, data.title, data.shortDescription, data.description, data.price, data.priceUnit,
      data.category, data.estimatedDuration, data.image, JSON.stringify(gallery), JSON.stringify(included),
      data.seoTitle, data.seoDescription, data.seoKeywords, data.isActive ? 1 : 0,
      (maxSort?.max_sort ?? 0) + 1,
    ],
  );

  revalidateCatalog(slug);
  return { ok: true, message: "Услуга создана", serviceId: Number(result.lastInsertRowid), slug };
}

export async function adminDeleteServiceAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Некорректный идентификатор" };

  const existing = await dbGet<DbServiceRow>("SELECT slug FROM services WHERE id = ?", [id.data]);
  if (!existing) return { ok: false, message: "Услуга не найдена" };

  await dbRun("DELETE FROM services WHERE id = ?", [id.data]);
  revalidateCatalog(existing.slug);
  return { ok: true, message: "Услуга удалена" };
}

export type UploadImagesResult = ActionResult & { urls?: string[] };

export async function adminUploadServiceImagesAction(formData: FormData): Promise<UploadImagesResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return { ok: false, message: "Файлы не выбраны" };
  if (files.length > 8) return { ok: false, message: "Не более 8 файлов за раз" };

  const uploadsDir = getUploadsDir();
  const urls: string[] = [];

  for (const file of files) {
    if (!isAllowedImageType(file.type)) {
      return { ok: false, message: `Формат ${file.type || "неизвестен"} не поддерживается (JPEG, PNG, WebP, AVIF)` };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, message: `Файл ${file.name} больше 8 МБ` };
    }

    const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${extensionForMime(file.type)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(uploadsDir, fileName), buffer);
    urls.push(`/api/uploads/services/${fileName}`);
  }

  return { ok: true, message: `Загружено файлов: ${urls.length}`, urls };
}
