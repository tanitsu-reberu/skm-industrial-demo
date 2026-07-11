import type { Metadata } from "next";
import { ServiceFilter } from "@/components/service-filter";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { getPublicServices } from "@/lib/services-db";

export const revalidate = 300;

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

export default async function ServicesPage() {
  const services = await getPublicServices();

  return (
    <PageTransition>
      <main className="section-shell py-12 md:py-16 lg:py-20">
        <div className="mb-10 max-w-3xl md:mb-12">
          <Badge>Каталог услуг</Badge>
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
            Вентиляция, чиллеры и фанкойлы
          </h1>
          <p className="mt-5 text-base leading-8 text-muted md:text-lg md:leading-8">
            Выберите услугу для объекта: монтаж, диагностика, ремонт, обслуживание, наладка или модернизация инженерных систем.
          </p>
        </div>
        <ServiceFilter services={services} />
      </main>
    </PageTransition>
  );
}
