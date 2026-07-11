import type { MetadataRoute } from "next";
import { services as staticServices } from "@/lib/services";
import { getPublicServices } from "@/lib/services-db";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://service-skm.ru";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl();
  const now = new Date();

  // Услуги берём из БД (включая созданные в админке); при сбое БД — статический список.
  let services: Array<{ slug: string }> = staticServices;
  try {
    services = await getPublicServices();
  } catch {
    // оставляем статический фолбэк
  }

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
    {
      url: `${baseUrl}/politika`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...services.map((service) => ({
      url: `${baseUrl}/services/${service.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    })),
  ];
}
