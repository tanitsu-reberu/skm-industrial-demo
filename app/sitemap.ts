import type { MetadataRoute } from "next";
import { services } from "@/lib/services";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://service-skm.ru";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl();
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/services`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...services.map((service) => ({
      url: `${baseUrl}/services/${service.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    })),
  ];
}
