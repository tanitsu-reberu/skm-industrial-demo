import { faqItems } from "@/lib/faq";
import { siteConfig } from "@/lib/site-config";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://service-skm.ru";

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${siteUrl}/#organization`,
    name: siteConfig.companyName,
    alternateName: siteConfig.shortName,
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    image: `${siteUrl}/logo.png`,
    telephone: siteConfig.phone,
    email: siteConfig.email,
    description:
      "Монтаж, ремонт и обслуживание вентиляции, чиллеров и фанкойлов для коммерческих и промышленных объектов.",
    areaServed: {
      "@type": "Country",
      name: "Россия",
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "00:00",
      closes: "23:59",
    },
  };
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function serviceJsonLd(service: {
  slug: string;
  title: string;
  shortDescription: string;
  price: number;
  image: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    description: service.shortDescription,
    url: `${siteUrl}/services/${service.slug}`,
    image: `${siteUrl}${service.image}`,
    provider: {
      "@id": `${siteUrl}/#organization`,
    },
    offers: {
      "@type": "Offer",
      price: service.price,
      priceCurrency: "RUB",
      priceSpecification: {
        "@type": "PriceSpecification",
        price: service.price,
        priceCurrency: "RUB",
        valueAddedTaxIncluded: true,
      },
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ label: string; href?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${siteUrl}${item.href}` } : {}),
    })),
  };
}
