import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const icon = await readFile(path.join(process.cwd(), "public", "logo.png"));

  return new Response(icon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/png",
    },
  });
}
