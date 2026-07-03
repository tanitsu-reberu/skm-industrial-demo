import type { MetadataRoute } from "next";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://service-skm.ru";
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/services", "/services/"],
        disallow: ["/admin", "/account", "/login", "/checkout"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
