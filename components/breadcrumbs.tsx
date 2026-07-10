import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/60" aria-hidden="true" /> : null}
              <li className="flex min-w-0 items-center">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    prefetch
                    className="focus-ring rounded-sm underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={isLast ? "page" : undefined} className="truncate text-white">
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
