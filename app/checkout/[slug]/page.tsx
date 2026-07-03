import { notFound } from "next/navigation";
import { CheckoutPanel } from "@/components/checkout-panel";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { getServiceBySlug } from "@/lib/services";

export const metadata = {
  title: "Оформление заказа | СКМ",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) notFound();

  return (
    <PageTransition>
      <main className="section-shell grid min-h-[calc(100vh-4rem)] place-items-center py-12">
        <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 sm:p-6">
          <Badge>Checkout</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold text-white">Оплата услуги</h1>
          <p className="mt-4 leading-7 text-muted">Выберите способ оплаты для выбранной услуги.</p>
          <div className="mt-8">
            <CheckoutPanel service={service} />
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
