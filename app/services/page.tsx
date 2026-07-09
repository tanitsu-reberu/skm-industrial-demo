import type { Metadata } from "next";
import { ServiceFilter } from "@/components/service-filter";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Услуги вентиляции и холодоснабжения | СКМ",
  description:
    "Каталог услуг СКМ: монтаж вентиляции, обслуживание чиллеров, ремонт фанкойлов, диагностика и наладка холодоснабжения.",
  alternates: {
    canonical: "/services",
  },
  openGraph: {
    title: "Услуги вентиляции и холодоснабжения | СКМ",
    description:
      "Монтаж вентиляции, сервис чиллеров, фанкойлов и систем холодоснабжения для коммерческих объектов.",
    url: "/services",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Каталог услуг СКМ по вентиляции и холодоснабжению",
      },
    ],
  },
};

export default function ServicesPage() {
  return (
    <PageTransition>
      <main className="section-shell py-12 sm:py-16">
        <div className="mb-10 max-w-3xl">
          <Badge>Каталог услуг</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold text-white sm:text-6xl">Вентиляция, чиллеры и фанкойлы</h1>
          <p className="mt-5 text-base leading-8 text-muted">
            Выберите услугу для объекта: монтаж, диагностика, ремонт, обслуживание, наладка или модернизация инженерных систем.
          </p>
        </div>
        <ServiceFilter />
      </main>
    </PageTransition>
  );
}
