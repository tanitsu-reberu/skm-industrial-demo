import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * Каталог для загружаемых админом файлов. Живёт рядом с базой SQLite:
 * на Vercel — во временной /tmp, на обычном сервере (Timeweb) — в ./data,
 * который сохраняется между деплоями.
 */
export function getUploadsDir() {
  const base = process.env.VERCEL ? "/tmp/skm-data" : path.join(process.cwd(), "data");
  const dir = path.join(base, "uploads", "services");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function isAllowedImageType(mime: string): boolean {
  return mime in MIME_EXTENSIONS;
}

export function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[mime] ?? ".bin";
}

/** Санитизация имени файла: только [a-z0-9-_.], без обхода директорий. */
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_.]/g, "").replace(/\.{2,}/g, ".") || "file";
}
