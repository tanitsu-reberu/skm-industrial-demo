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
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/82 backdrop-blur-xl">
      <div className="section-shell flex min-h-[76px] items-center justify-between gap-3 py-3 sm:min-h-20">
        <Link href="/" className="flex shrink-0 items-center" aria-label="На главную">
          <Image
            src="/logo.png"
            alt="ООО СКМ - сервис вентиляции и холодоснабжения"
            width={56}
            height={56}
            className="motion-gpu h-[52px] w-[52px] object-contain transition-opacity hover:opacity-90 sm:h-[56px] sm:w-[56px]"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="default">
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>

        <HeaderAuthSlot />
        <MobileMenu />
      </div>
    </header>
  );
}