import Image from "next/image";
import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/", label: "Главная" },
  { href: "/services", label: "Услуги" },
  { href: "/account", label: "Кабинет" },
];

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/82 backdrop-blur-xl">
      <div className="section-shell flex min-h-20 items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center" aria-label="На главную">
          <Image
            src="/logo.png"
            alt="ООО Сервис Компрессорных Машин"
            width={180}
            height={56}
            className="h-[52px] w-auto object-contain"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="sm">
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
                <Link href="/account">
                  <UserRound className="h-4 w-4" />
                  {user.email}
                </Link>
              </Button>
              <form action={logoutAction}>
                <Button variant="ghost" size="icon" aria-label="Выйти">
                  <LogOut className="h-4 w-4" />
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Войти</Link>
            </Button>
          )}
        </div>
      </div>
      <nav className="section-shell flex gap-2 overflow-x-auto pb-3 md:hidden">
        {nav.map((item) => (
          <Button key={item.href} asChild variant="ghost" size="sm" className="shrink-0">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}
      </nav>
    </header>
  );
}
