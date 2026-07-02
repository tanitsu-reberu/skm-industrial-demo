import { ServiceFilter } from "@/components/service-filter";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Услуги | СКМ",
};

export default function ServicesPage() {
  return (
    <PageTransition>
      <main className="section-shell py-12 sm:py-16">
        <div className="mb-10 max-w-3xl">
          <Badge>Каталог услуг</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold text-white sm:text-6xl">Сервис промышленного оборудования</h1>
          <p className="mt-5 text-base leading-8 text-muted">
            Выберите направление и откройте карточку услуги: внутри есть состав работ, срок, стоимость и оформление заказа.
          </p>
        </div>
        <ServiceFilter />
      </main>
    </PageTransition>
  );
}
