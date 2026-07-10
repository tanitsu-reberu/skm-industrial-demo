import Image from "next/image";
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
          <Image
            src="/logo.png"
            alt="ООО СКМ - сервис вентиляции и холодоснабжения"
            width={56}
            height={56}
            className="motion-gpu h-11 w-11 object-contain transition-opacity hover:opacity-90 sm:h-14 sm:w-14"
            priority
          />
        </Link>

        <nav aria-label="Основная навигация" className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex">
          {nav.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="default" className="shrink-0 px-3 xl:px-5">
              <Link href={item.href} prefetch>
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <HeaderAuthSlot />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}