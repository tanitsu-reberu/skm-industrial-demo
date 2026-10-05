"use client";

import { Home, Phone, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ContactDialog } from "@/components/contact-dialog";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/services", label: "Услуги", icon: Wrench },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Мобильная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid h-16 grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-foreground/80 hover:text-white",
              )}
            >
              <Icon className={cn("h-5 w-5", active ? "text-primary" : "")} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
        <ContactDialog>
          <button type="button" className="focus-ring flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-primary transition-colors hover:text-white">
            <Phone className="h-5 w-5" aria-hidden="true" />
            Связаться
          </button>
        </ContactDialog>
      </div>
    </nav>
  );
}
