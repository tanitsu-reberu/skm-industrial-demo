import { NextResponse } from "next/server";
import { getTawkConfig } from "@/lib/tawk";

export const dynamic = "force-dynamic";

export async function GET() {
  const tawk = getTawkConfig();

  if (!tawk) {
    return new NextResponse("Tawk.to is not configured", { status: 404 });
  }

  const response = await fetch(`https://embed.tawk.to/${tawk.propertyId}/${tawk.widgetId}`, {
    headers: {
      Accept: "application/javascript,text/javascript,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 SKM Website",
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    return new NextResponse(`Tawk.to embed failed: ${response.status}`, { status: 502 });
  }

  const script = (await response.text()).replaceAll(
    "https://embed.tawk.to/_s/",
    "/api/tawk/static/_s/",
  );

  return new NextResponse(script, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}
