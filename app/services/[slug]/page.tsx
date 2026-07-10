import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3 } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CheckoutLauncher } from "@/components/checkout-launcher";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { services, getServiceBySlug } from "@/lib/services";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

function limitMeta(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}…` : value;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) {
    return {
      title: "Услуга вентиляции и холодоснабжения | СКМ",
      description: "Монтаж, обслуживание и ремонт систем вентиляции, чиллеров, фанкойлов и холодоснабжения.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = limitMeta(`${service.title} | СКМ`, 60);
  const description = limitMeta(
    `${service.shortDescription} Монтаж, сервис и диагностика вентиляции, чиллеров и фанкойлов.`,
    160,
  );

  return {
    title,
    description,
    alternates: {
      canonical: `/services/${service.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `/services/${service.slug}`,
      images: [
        {
          url: service.image,
          width: 1200,
          height: 630,
          alt: `${service.title} - СКМ`,
        },
      ],
    },
  };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) notFound();

  return (
    <PageTransition>
      <main className="section-shell py-10 md:py-14 lg:py-16">
        <Breadcrumbs
          items={[
            { label: "Главная", href: "/" },
            { label: "Услуги", href: "/services" },
            { label: service.title },
          ]}
        />

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="relative aspect-[16/11] overflow-hidden rounded-lg border border-border bg-card">
            <Image
              src={service.image}
              alt={`${service.title} - услуга СКМ`}
              fill
              priority
              className="smooth-media object-cover"
              sizes="(max-width: 1024px) 100vw, 58vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <Badge className="absolute left-5 top-5 border-primary/40 bg-black/55 text-white backdrop-blur">{service.category}</Badge>
          </div>

          <aside className="rounded-lg border border-border bg-card p-5 sm:p-6">
            <h1 className="font-display text-3xl font-semibold leading-tight text-white sm:text-5xl">{service.title}</h1>
            <p className="mt-5 text-base leading-8 text-muted">{service.description}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-surface p-4">
                <p className="text-sm text-muted">Стоимость</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">от {formatMoney(service.price)}</p>
              </div>
              <div className="rounded-md border border-border bg-surface p-4">
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Срок
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">{service.estimatedDuration}</p>
              </div>
            </div>
            <div id="checkout" className="mt-6 scroll-mt-24">
              <CheckoutLauncher service={service} />
            </div>
          </aside>
        </div>

        <section className="mt-10 rounded-lg border border-border bg-card p-5 sm:p-6 md:p-7">
          <h2 className="font-display text-2xl font-semibold text-white">Что входит</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {service.included.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-border bg-surface p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm text-white">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </PageTransition>
  );
}
