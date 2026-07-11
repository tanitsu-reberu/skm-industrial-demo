import fs from "node:fs/promises";
import path from "node:path";
import { getUploadsDir, safeFileName } from "@/lib/uploads";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const fileName = safeFileName(file);

  try {
    const uploadsDir = path.resolve(getUploadsDir());
    const filePath = path.resolve(uploadsDir, fileName);
    if (!filePath.startsWith(`${uploadsDir}${path.sep}`)) {
      return new Response("Not found", { status: 404 });
    }

    const data = await fs.readFile(filePath);
    const contentType = CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
