import { ServiceFilter } from "@/components/service-filter";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Услуги по вентиляции и холодоснабжению | СКМ",
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
