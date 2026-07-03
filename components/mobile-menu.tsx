"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Home, LogIn, LogOut, Menu, UserRound, Wrench, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminPanelAccess } from "@/components/admin-panel-access";
import { logoutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const mobileNav = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/services", label: "Услуги", icon: Wrench },
  { href: "/account", label: "Кабинет", icon: UserRound },
];

export function MobileMenu({
  userEmail,
  adminAccess,
}: {
  userEmail?: string | null;
  adminAccess?: { hasPassword: boolean; hasAccess: boolean } | null;
}) {
  const pathname = usePathname();

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Открыть меню">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm md:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(88vw,360px)] flex-col border-l border-border bg-[#0A0A0A] p-5 shadow-2xl md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-primary">SKM</p>
              <DialogPrimitive.Title className="mt-1 font-display text-xl font-semibold text-white">
                Навигация
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Закрыть меню">
                <X className="h-5 w-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <nav className="mt-8 grid gap-2">
            {mobileNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "focus-ring flex min-h-12 items-center gap-3 rounded-md border px-4 text-base font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-white shadow-red"
                      : "border-border bg-card text-muted hover:border-primary/60 hover:text-white",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3 border-t border-border pt-5">
            {userEmail ? (
              <>
                {adminAccess ? (
                  <AdminPanelAccess
                    variant="menu"
                    hasPassword={adminAccess.hasPassword}
                    hasAccess={adminAccess.hasAccess}
                  />
                ) : null}
                <Link
                  href="/account"
                  className="focus-ring flex min-h-12 items-center gap-3 rounded-md border border-border bg-card px-4 text-sm font-medium text-white"
                >
                  <UserRound className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{userEmail}</span>
                </Link>
                <form action={logoutAction}>
                  <Button variant="secondary" className="w-full justify-start">
                    <LogOut className="h-5 w-5" />
                    Выйти
                  </Button>
                </form>
              </>
            ) : (
              <Button asChild className="w-full justify-start">
                <Link href="/login">
                  <LogIn className="h-5 w-5" />
                  Войти
                </Link>
              </Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}