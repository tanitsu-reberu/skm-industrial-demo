import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const safePath = path.join("/");

  if (!safePath.startsWith("_s/") || safePath.includes("..")) {
    return new NextResponse("Invalid Tawk.to asset path", { status: 400 });
  }

  const response = await fetch(`https://embed.tawk.to/${safePath}`, {
    headers: {
      Accept: "application/javascript,text/javascript,text/css,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 SKM Website",
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    return new NextResponse(`Tawk.to asset failed: ${response.status}`, { status: 502 });
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const isTextAsset =
    contentType.includes("text/") ||
    contentType.includes("javascript") ||
    contentType.includes("json");
  const body = isTextAsset
    ? (await response.text()).replaceAll("https://embed.tawk.to/_s/", "/api/tawk/static/_s/")
    : await response.arrayBuffer();

  return new NextResponse(body, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Type": contentType,
    },
  });
}
