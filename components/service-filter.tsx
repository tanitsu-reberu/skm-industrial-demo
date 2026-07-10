"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CatalogSkeleton } from "@/components/catalog-skeleton";
import { ServiceCard } from "@/components/service-card";
import { Button } from "@/components/ui/button";
import { serviceCategories, services } from "@/lib/services";
import { cn } from "@/lib/utils";

export function ServiceFilter() {
  const [active, setActive] = useState<(typeof serviceCategories)[number]>("Все");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () => (active === "Все" ? services : services.filter((service) => service.category === active)),
    [active],
  );

  function selectCategory(category: (typeof serviceCategories)[number]) {
    startTransition(() => setActive(category));
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {serviceCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => selectCategory(category)}
            aria-pressed={active === category}
            className={cn(
              "focus-ring smooth-button min-h-12 rounded-md border px-4 py-2.5 text-left text-sm font-medium leading-6 md:min-h-11 md:px-5 md:text-base md:leading-6",
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

      {isPending ? (
        <CatalogSkeleton count={filtered.length || 6} />
      ) : (
        <div
          className={cn(
            "grid auto-rows-fr gap-5 md:grid-cols-2 md:gap-6 xl:grid-cols-3",
            "transition-opacity duration-200",
          )}
        >
          {filtered.map((service, index) => (
            <ServiceCard key={service.slug} service={service} priority={index < 2} />
          ))}
        </div>
      )}

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