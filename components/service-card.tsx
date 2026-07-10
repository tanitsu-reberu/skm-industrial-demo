import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Service } from "@/lib/services";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/utils";

type ServiceCardProps = {
  service: Service;
  variant?: "catalog" | "preview";
  priority?: boolean;
};

export function ServiceCard({ service, variant = "catalog", priority = false }: ServiceCardProps) {
  if (variant === "preview") {
    return (
      <article
        className={cn(
          "smooth-card group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card",
          "hover:border-primary/60",
        )}
      >
        <div className="flex flex-1 flex-col p-5 md:p-6 lg:p-7">
          <Badge className="w-fit max-w-full truncate border-primary/40 bg-primary/10 text-white">
            {service.category}
          </Badge>
          <h3 className="service-card-title mt-4">{service.title}</h3>
          <p className="service-card-description mt-3 flex-1">{service.shortDescription}</p>
        </div>
        <div className="flex flex-col gap-3 border-t border-border p-5 pt-4 sm:flex-row sm:items-center sm:justify-between md:p-6 md:pt-5">
          <span className="font-display text-lg font-semibold text-white lg:text-xl">
            от {formatMoney(service.price)}
          </span>
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href={`/services/${service.slug}`} prefetch>
              Подробнее
            </Link>
          </Button>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "smooth-card group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card",
        "hover:border-primary/60",
      )}
    >
      <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-surface">
        <Image
          src={service.image}
          alt={`${service.title} - услуга СКМ`}
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className="smooth-media object-cover opacity-90 group-hover:opacity-100"
          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <Badge className="absolute left-4 top-4 max-w-[calc(100%-2rem)] truncate border-primary/40 bg-black/75 text-white">
          {service.category}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col p-5 md:p-6">
        <h2 className="service-card-title">{service.title}</h2>
        <p className="service-card-description mt-3 flex-1">{service.shortDescription}</p>

        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 md:flex-row md:items-end md:justify-between">
          <span className="text-sm leading-6 text-muted md:text-base">{service.estimatedDuration}</span>
          <span className="font-display text-lg font-semibold leading-none text-white md:text-xl">
            от {formatMoney(service.price)}
          </span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
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
    </article>
  );
}