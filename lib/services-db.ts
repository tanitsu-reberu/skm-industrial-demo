import "server-only";

import { dbAll, dbGet } from "@/lib/db";
import { services as staticServices, type Service, type ServiceCategory } from "@/lib/services";

export type DbServiceRow = {
  id: number;
  slug: string;
  title: string;
  short_description: string;
  description: string;
  price: number;
  price_unit: string;
  category: string;
  estimated_duration: string;
  image: string;
  gallery: string;
  included: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AdminService = Service & {
  priceUnit: string;
  gallery: string[];
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  isActive: boolean;
  sortOrder: number;
};

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function rowToService(row: DbServiceRow): AdminService {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,
    description: row.description,
    price: row.price,
    priceUnit: row.price_unit,
    category: row.category as ServiceCategory,
    estimatedDuration: row.estimated_duration,
    image: row.image,
    gallery: parseJsonArray(row.gallery),
    included: parseJsonArray(row.included),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: row.seo_keywords,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}

/** Активные услуги для публичного каталога (с фолбэком на статический список при пустой/недоступной БД). */
export async function getPublicServices(): Promise<AdminService[]> {
  try {
    const rows = await dbAll<DbServiceRow>(
      "SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order ASC, id ASC",
    );
    if (rows.length > 0) return rows.map(rowToService);
  } catch (error) {
    console.error("[services-db] fallback to static services:", error);
  }
  return staticServices.map((service) => ({
    ...service,
    priceUnit: "",
    gallery: [],
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    isActive: true,
    sortOrder: service.id,
  }));
}

/** Все услуги для админ-панели, включая скрытые. */
export async function getAllServicesForAdmin(): Promise<AdminService[]> {
  const rows = await dbAll<DbServiceRow>("SELECT * FROM services ORDER BY sort_order ASC, id ASC");
  return rows.map(rowToService);
}

export async function getPublicServiceBySlug(slug: string): Promise<AdminService | undefined> {
  try {
    const row = await dbGet<DbServiceRow>("SELECT * FROM services WHERE slug = ? AND is_active = 1", [slug]);
    if (row) return rowToService(row);
  } catch (error) {
    console.error("[services-db] fallback to static service:", error);
  }
  const fallback = staticServices.find((service) => service.slug === slug);
  if (!fallback) return undefined;
  return {
    ...fallback,
    priceUnit: "",
    gallery: [],
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    isActive: true,
    sortOrder: fallback.id,
  };
}
