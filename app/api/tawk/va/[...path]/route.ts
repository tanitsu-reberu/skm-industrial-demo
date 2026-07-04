import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function proxyVaRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const safePath = path.join("/");

  if (safePath.includes("..")) {
    return new NextResponse("Invalid Tawk.to API path", { status: 400 });
  }

  const targetUrl = new URL(`https://va.tawk.to/${safePath}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const response = await fetch(targetUrl, {
    method,
    headers: {
      Accept: request.headers.get("accept") ?? "application/json,*/*;q=0.8",
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      Origin: "https://embed.tawk.to",
      Referer: "https://embed.tawk.to/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent": "Mozilla/5.0 SKM Website",
    },
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });

  const body = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "application/json";

  return new NextResponse(body, {
    status: response.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
    },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export const GET = proxyVaRequest;
export const POST = proxyVaRequest;
