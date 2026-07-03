import Image from "next/image";
import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { AdminPanelAccess } from "@/components/admin-panel-access";
import { getCurrentUser } from "@/lib/auth";
import { getAdminPanelAccessState, logoutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { MobileMenu } from "@/components/mobile-menu";

const nav = [
  { href: "/", label: "Главная" },
  { href: "/services", label: "Услуги" },
  { href: "/account", label: "Кабинет" },
];

export async function Header() {
  const user = await getCurrentUser();
  const adminAccess = user?.role === "admin" ? await getAdminPanelAccessState() : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/82 backdrop-blur-xl">
      <div className="section-shell flex min-h-[76px] items-center justify-between gap-3 py-3 sm:min-h-20">
        <Link href="/" className="flex shrink-0 items-center" aria-label="На главную">
          <Image
            src="/logo.png"
            alt="ООО СКМ"
            width={180}
            height={56}
            className="h-[52px] w-auto object-contain transition-opacity hover:opacity-90 sm:h-[56px]"
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

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              {adminAccess?.isAdmin ? (
                <AdminPanelAccess
                  hasPassword={adminAccess.hasPassword}
                  hasAccess={adminAccess.hasAccess}
                />
              ) : null}
              <Button asChild variant="secondary" size="sm" className="max-w-[min(100%,14rem)]">
                <Link href="/account" className="min-w-0">
                  <UserRound className="h-4 w-4 shrink-0" />
                  <span className="truncate">{user.email}</span>
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

        <MobileMenu
          userEmail={user?.email}
          adminAccess={adminAccess?.isAdmin ? adminAccess : null}
        />
      </div>
    </header>
  );
}
