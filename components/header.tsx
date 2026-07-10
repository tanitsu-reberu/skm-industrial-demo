import Link from "next/link";
import { HeaderAuthSlot } from "@/components/header-auth-slot";
import { MobileMenu } from "@/components/mobile-menu";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/", label: "Главная" },
  { href: "/services", label: "Услуги" },
  { href: "/account", label: "Кабинет" },
];

export function Header() {
  return (
    <header className="tablet-solid-header sticky top-0 z-40 border-b border-border/80 bg-background/82 backdrop-blur-xl">
      <div className="section-shell flex h-16 items-center gap-2 sm:h-[4.5rem] sm:gap-3">
        <Link href="/" className="flex shrink-0 items-center" aria-label="На главную">
          <picture>
            <source srcSet="/logo.webp" type="image/webp" />
            <img
              src="/logo.png"
              alt="ООО СКМ - сервис вентиляции и холодоснабжения"
              width={56}
              height={56}
              decoding="async"
              fetchPriority="high"
              className="motion-gpu h-11 w-11 object-contain transition-opacity hover:opacity-90 sm:h-14 sm:w-14"
            />
          </picture>
        </Link>

        <nav aria-label="Основная навигация" className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 md:flex">
          {nav.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="default" className="shrink-0 px-3 xl:px-5">
              <Link href={item.href} prefetch>
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>

        <div className="header-actions ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <Button
            asChild
            size="default"
            className="hidden h-11 min-w-[5.25rem] shrink-0 px-4 md:inline-flex lg:hidden"
          >
            <Link href="/login" prefetch>
              Войти
            </Link>
          </Button>
          <HeaderAuthSlot />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}