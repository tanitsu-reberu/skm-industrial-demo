"use client";

import { Home, Phone, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/services", label: "Услуги", icon: Wrench },
  { href: "/account", label: "Кабинет", icon: UserRound },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Мобильная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="grid h-16 grid-cols-4">
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
                active ? "text-primary" : "text-muted hover:text-white",
              )}
            >
              <Icon className={cn("h-5 w-5", active ? "text-primary" : "")} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
        <a
          href={siteConfig.phoneHref}
          className="focus-ring flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-primary transition-colors hover:text-white"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          Позвонить
        </a>
      </div>
    </nav>
  );
}
