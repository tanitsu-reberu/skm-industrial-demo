"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
      <div className="flex gap-2 overflow-x-auto pb-2">
        {serviceCategories.map((category) => (
          <button
            key={category}
            onClick={() => setActive(category)}
            className={`focus-ring shrink-0 rounded-md border px-4 py-2 text-sm font-medium transition-all duration-200 ${
              active === category
                ? "border-primary bg-primary text-white shadow-red"
                : "border-border bg-card text-muted hover:border-primary/60 hover:text-white"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((service, index) => (
            <motion.article
              layout
              key={service.slug}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.38, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] }}
              className="group overflow-hidden rounded-lg border border-border bg-card"
            >
              <Link href={`/services/${service.slug}`} className="block">
                <div className="relative aspect-[16/10] overflow-hidden bg-surface">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    className="object-cover opacity-85 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-transparent to-transparent" />
                  <Badge className="absolute left-4 top-4 border-primary/40 bg-black/55 text-white backdrop-blur">
                    {service.category}
                  </Badge>
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-display text-xl font-semibold leading-tight text-white">{service.title}</h2>
                    <ArrowUpRight className="h-5 w-5 shrink-0 text-muted transition group-hover:text-primary" />
                  </div>
                  <p className="min-h-[72px] text-sm leading-6 text-muted">{service.shortDescription}</p>
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="text-sm text-muted">{service.estimatedDuration}</span>
                    <span className="font-display text-lg font-semibold text-white">от {formatMoney(service.price)}</span>
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
        </AnimatePresence>
      </motion.div>

      <div className="flex justify-center">
        <Button asChild variant="secondary">
          <Link href="/account">Перейти в кабинет</Link>
        </Button>
      </div>
    </div>
  );
}
