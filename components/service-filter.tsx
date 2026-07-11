"use client";

import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { serviceCategories, services as staticServices, type Service } from "@/lib/services";
import { cn, formatMoney } from "@/lib/utils";

export function ServiceFilter({ services = staticServices }: { services?: Service[] }) {
  const [active, setActive] = useState<(typeof serviceCategories)[number]>("Все");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const byCategory = active === "Все" ? services : services.filter((service) => service.category === active);
    const normalized = query.trim().toLowerCase();
    if (!normalized) return byCategory;

    return byCategory.filter((service) =>
      [service.title, service.shortDescription, service.category].some((field) =>
        field.toLowerCase().includes(normalized),
      ),
    );
  }, [active, query, services]);

  return (
    <div className="space-y-8">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по услугам: вентиляция, чиллеры, фанкойлы…"
          aria-label="Поиск по услугам"
          className="focus-ring h-12 w-full rounded-md border border-border bg-card pl-12 pr-4 text-base text-white placeholder:text-muted"
        />
      </div>

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {serviceCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActive(category)}
            aria-pressed={active === category}
            className={cn(
              "focus-ring smooth-button min-h-12 rounded-md border px-4 py-2.5 text-left text-sm font-medium leading-6 md:px-5 md:text-base",
              "sm:text-center",
              active === category
                ? "border-primary bg-primary text-white shadow-red"
                : "border-border bg-card text-muted hover:border-primary/60 hover:text-white",
            )}
          >
            {category}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-base text-muted">
            {"По запросу "}
            <span className="font-semibold text-white">{query}</span>
            {" ничего не найдено. Попробуйте другое слово или "}
            <a href={`tel:+79911230507`} className="font-semibold text-primary underline-offset-4 hover:underline">
              позвоните нам
            </a>
            {" — подскажем."}
          </p>
        </div>
      ) : null}

      <div className="grid auto-rows-fr gap-5 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {filtered.map((service, index) => (
            <article
              key={service.slug}
              className="smooth-card group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card hover:border-primary/60"
            >
              <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-surface">
                <Image
                  src={service.image}
                  alt={`${service.title} - услуга СКМ`}
                  fill
                  priority={index < 2}
                  loading={index < 2 ? undefined : "lazy"}
                  className="smooth-media object-cover opacity-90 group-hover:opacity-100"
                  sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <Badge className="absolute left-4 top-4 max-w-[calc(100%-2rem)] truncate border-primary/40 bg-black/75 text-white">
                  {service.category}
                </Badge>
              </div>

              <div className="flex flex-1 flex-col p-5 md:p-6">
                <h2 className="catalog-card-title font-display text-lg font-semibold text-white md:text-xl">
                  {service.title}
                </h2>
                <p className="catalog-card-description mt-3 flex-1 text-base text-muted">{service.shortDescription}</p>

                <div className="mt-auto shrink-0 space-y-4 pt-4">
                  <div className="flex flex-col gap-1 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm leading-6 text-muted md:text-base">{service.estimatedDuration}</span>
                    <span className="font-display text-lg font-semibold text-white md:text-xl">
                      от {formatMoney(service.price)}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button asChild variant="secondary" className="w-full">
                      <Link href={`/services/${service.slug}`} prefetch>
                        Подробнее
                      </Link>
                    </Button>
                    <Button asChild className="w-full">
                      <Link href={`/services/${service.slug}#checkout`} prefetch>
                        Заказать
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
      </div>

      <div className="flex justify-center pt-2">
        <Button asChild variant="secondary" className="w-full md:w-auto" size="lg">
          <Link href="/account" prefetch>
            Перейти в кабинет
          </Link>
        </Button>
      </div>
    </div>
  );
}
