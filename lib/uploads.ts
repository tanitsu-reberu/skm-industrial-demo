import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dbGet, dbTransaction, dbTxAll, dbTxGet, dbTxRun, type DbTxExecutor } from "@/lib/db";

/** Read-only compatibility path for uploads created before database storage. */
export function getUploadsDir() {
  const base = process.env.VERCEL ? "/tmp/skm-data" : path.join(process.cwd(), "data");
  return path.join(base, "uploads", "services");
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
};
const URL_PREFIX = "/api/uploads/services/";
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_BATCH_BYTES = 24 * 1024 * 1024;
// Plain pg_dump hex-encodes BYTEA; leave headroom within the 128 MiB dump limit.
export const MAX_TOTAL_UPLOAD_BYTES = 48 * 1024 * 1024;
// Bound row/filename overhead too, including very small but signature-valid images.
export const MAX_STORED_UPLOADS = 1024;
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export class UploadError extends Error {}

export function isAllowedImageType(mime: string): boolean {
  return Object.hasOwn(MIME_EXTENSIONS, mime);
}

export function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[mime] ?? ".bin";
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_.]/g, "").replace(/\.{2,}/g, ".") || "file";
}

export function isSafeImageFileName(name: string): boolean {
  return name.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:jpe?g|png|webp|avif)$/i.test(name) &&
    !name.includes("..");
}

export function imageMatchesMime(data: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return data.length >= 4 && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mime === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return data.length >= 16 && data.toString("ascii", 0, 4) === "RIFF" &&
    data.readUInt32LE(4) === data.length - 8 && data.toString("ascii", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(data.toString("ascii", 12, 16));
  if (mime === "image/avif" && data.length >= 20 && data.toString("ascii", 4, 8) === "ftyp") {
    const size = data.readUInt32BE(0);
    if (size < 20 || size > data.length || size % 4 !== 0) return false;
    for (let offset = 8; offset < size; offset += 4) {
      if (offset !== 12 && ["avif", "avis"].includes(data.toString("ascii", offset, offset + 4))) return true;
    }
  }
  return false;
}

function uploadName(url: string): string | undefined {
  if (!url.startsWith(URL_PREFIX)) return undefined;
  const name = url.slice(URL_PREFIX.length);
  if (!isSafeImageFileName(name)) throw new UploadError("Некорректная ссылка на изображение");
  return name;
}

async function referencedUploads(tx: DbTxExecutor): Promise<Set<string>> {
  const services = await dbTxAll<{ image: string; gallery: string }>(tx, "SELECT image, gallery FROM services");
  const refs = new Set<string>();
  for (const service of services) {
    let gallery: unknown = [];
    try { gallery = JSON.parse(service.gallery); } catch { /* Keep the main image reference. */ }
    for (const url of [service.image, ...(Array.isArray(gallery) ? gallery : [])]) {
      if (typeof url === "string" && url.startsWith(URL_PREFIX)) refs.add(url.slice(URL_PREFIX.length));
    }
  }
  return refs;
}

async function cleanupUploads(tx: DbTxExecutor) {
  const refs = await referencedUploads(tx);
  const uploads = await dbTxAll<{ id: string; created_at: number; attached_at: number | null }>(tx,
    "SELECT id, created_at, attached_at FROM service_uploads");
  const now = Date.now();
  for (const upload of uploads) {
    if (refs.has(upload.id)) {
      if (upload.attached_at === null) await dbTxRun(tx, "UPDATE service_uploads SET attached_at = ? WHERE id = ?", [now, upload.id]);
    } else if (upload.attached_at !== null || upload.created_at <= now - PENDING_UPLOAD_TTL_MS) {
      await dbTxRun(tx, "DELETE FROM service_uploads WHERE id = ?", [upload.id]);
    }
  }
}

/** Service reference changes and cleanup share the quota lock. Never deletes filesystem files. */
export async function withServiceUploads<T>(fn: (tx: DbTxExecutor) => Promise<T>): Promise<T> {
  const run = async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await dbTransaction(async tx => {
          await dbTxRun(tx, "UPDATE service_upload_lock SET id = id WHERE id = 1");
          await cleanupUploads(tx);
          const result = await fn(tx);
          await cleanupUploads(tx);
          return result;
        });
      } catch (error) {
        if (process.env.POSTGRES_URL || (error as { code?: string }).code !== "SQLITE_BUSY" || attempt >= 5) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  };
  if (process.env.POSTGRES_URL) return run();
  // libsql local write transactions must queue; the database lock still protects other processes.
  const state = globalThis as typeof globalThis & { skmUploadQueue?: Promise<unknown> };
  const result = (state.skmUploadQueue ?? Promise.resolve()).then(run, run);
  state.skmUploadQueue = result.catch(() => undefined);
  return result;
}

export async function validateServiceUploadReferences(tx: DbTxExecutor, urls: string[], ownerId: number) {
  for (const url of urls) {
    const name = uploadName(url);
    if (!name) continue;
    const upload = await dbTxGet<{ owner_id: number; attached_at: number | null }>(tx,
      "SELECT owner_id, attached_at FROM service_uploads WHERE id = ?", [name]);
    if (upload ? upload.attached_at === null && upload.owner_id !== ownerId : !fs.existsSync(path.join(getUploadsDir(), name))) {
      throw new UploadError("Изображение недоступно или срок несохранённой загрузки истёк. Загрузите его снова.");
    }
  }
}

export async function storeServiceImages(entries: FormDataEntryValue[], ownerId: number): Promise<string[]> {
  if (!entries.length) throw new UploadError("Файлы не выбраны");
  if (entries.length > 8) throw new UploadError("Не более 8 файлов за раз");
  if (entries.some(entry => !(entry instanceof File))) throw new UploadError("Некорректные файлы");
  const files = entries as File[];
  if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_BATCH_BYTES) {
    throw new UploadError("Общий размер файлов больше 24 МБ");
  }
  const images: Array<{ id: string; mime: string; data: Buffer }> = [];
  for (const file of files) {
    if (!isAllowedImageType(file.type)) throw new UploadError("Поддерживаются только JPEG, PNG, WebP, AVIF");
    if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new UploadError("Размер каждого файла должен быть от 1 байта до 8 МБ");
    const data = Buffer.from(await file.arrayBuffer());
    if (data.length !== file.size || !imageMatchesMime(data, file.type)) {
      throw new UploadError("Содержимое файла не соответствует формату JPEG, PNG, WebP или AVIF");
    }
    images.push({ id: `${Date.now()}-${crypto.randomBytes(16).toString("hex")}${extensionForMime(file.type)}`, mime: file.type, data });
  }
  return withServiceUploads(async tx => {
    const current = await dbTxGet<{ total: number; count: number }>(tx,
      "SELECT COALESCE(SUM(byte_size), 0) AS total, COUNT(*) AS count FROM service_uploads");
    const bytes = images.reduce((total, image) => total + image.data.length, 0);
    if ((current?.total ?? 0) + bytes > MAX_TOTAL_UPLOAD_BYTES) {
      throw new UploadError("Общее хранилище изображений ограничено 48 МБ. Удалите ненужные изображения из услуг и сохраните изменения. Несохранённые загрузки освобождаются через 24 часа.");
    }
    if ((current?.count ?? 0) + images.length > MAX_STORED_UPLOADS) {
      throw new UploadError("В хранилище может быть не более 1024 изображений. Удалите ненужные изображения из услуг и сохраните изменения. Несохранённые загрузки освобождаются через 24 часа.");
    }
    for (const image of images) {
      await dbTxRun(tx, `INSERT INTO service_uploads (id, mime, data, byte_size, owner_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`, [image.id, image.mime, image.data, image.data.length, ownerId, Date.now()]);
    }
    return images.map(image => URL_PREFIX + image.id);
  });
}

export async function readServiceImage(name: string): Promise<{ data: Buffer; mime: string } | undefined> {
  if (!isSafeImageFileName(name)) return undefined;
  const row = await dbGet<{ data: ArrayBuffer | Uint8Array; mime: string }>("SELECT data, mime FROM service_uploads WHERE id = ?", [name]);
  if (row) return { data: Buffer.from(row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : row.data), mime: row.mime };
  const mime = Object.entries(MIME_EXTENSIONS).find(([, ext]) => ext === path.extname(name).toLowerCase())?.[0] ??
    (path.extname(name).toLowerCase() === ".jpeg" ? "image/jpeg" : undefined);
  if (!mime) return undefined;
  try {
    const directory = await fs.promises.realpath(getUploadsDir());
    const file = await fs.promises.realpath(path.join(directory, name));
    if (path.dirname(file) !== directory) return undefined;
    const data = await fs.promises.readFile(file);
    return imageMatchesMime(data, mime) ? { data, mime } : undefined;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined;
    throw error;
  }
}
