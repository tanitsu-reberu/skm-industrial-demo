"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { serviceCategories, services } from "@/lib/services";
import { formatMoney } from "@/lib/utils";

export function ServiceFilter() {
  const [active, setActive] = useState<(typeof serviceCategories)[number]>("Все");

  const filtered = useMemo(
    () => (active === "Все" ? services : services.filter((service) => service.category === active)),
    [active],
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {serviceCategories.map((category) => (
          <button
            key={category}
            onClick={() => setActive(category)}
            aria-pressed={active === category}
            className={`focus-ring smooth-button min-h-12 rounded-md border px-4 py-2.5 text-left text-sm font-medium leading-5 sm:min-h-11 sm:text-center ${
              active === category
                ? "border-primary bg-primary text-white shadow-red"
                : "border-border bg-card text-muted hover:border-primary/60 hover:text-white"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((service) => (
          <article
            key={service.slug}
            className="smooth-card group flex overflow-hidden rounded-lg border border-border bg-card hover:border-primary/60"
          >
            <div className="flex min-h-full w-full flex-col">
              <div className="relative aspect-[16/10] overflow-hidden bg-surface">
                <Image
                  src={service.image}
                  alt={`${service.title} - услуга СКМ`}
                  fill
                  loading="lazy"
                  className="smooth-media object-cover opacity-85 group-hover:scale-105 group-hover:opacity-100"
                  sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-transparent to-transparent" />
                <Badge className="absolute left-4 top-4 max-w-[calc(100%-2rem)] border-primary/40 bg-black/55 text-white backdrop-blur">
                  {service.category}
                </Badge>
              </div>
              <div className="flex flex-1 flex-col space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-display text-xl font-semibold leading-tight text-white">{service.title}</h2>
                  <ArrowUpRight className="motion-gpu mt-0.5 h-5 w-5 shrink-0 text-muted transition-colors group-hover:text-primary" />
                </div>
                <p className="text-base leading-7 text-muted sm:min-h-[72px] sm:text-sm sm:leading-6">
                  {service.shortDescription}
                </p>
                <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-muted">{service.estimatedDuration}</span>
                  <span className="font-display text-lg font-semibold text-white">от {formatMoney(service.price)}</span>
                </div>
                <div className="mt-auto grid gap-2 pt-1 sm:grid-cols-2">
                  <Button asChild variant="secondary" className="w-full">
                    <Link href={`/services/${service.slug}`}>Подробнее</Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href={`/services/${service.slug}#checkout`}>Заказать</Link>
                  </Button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="flex justify-center">
        <Button asChild variant="secondary" className="w-full sm:w-auto">
          <Link href="/account">Перейти в кабинет</Link>
        </Button>
      </div>
    </div>
  );
}
