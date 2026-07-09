"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import { Home, LogIn, LogOut, Menu, UserRound, Wrench, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loadSession, type SessionState } from "@/components/header-session-controls";
import { logoutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AdminPanelAccess = dynamic(
  () => import("@/components/admin-panel-access").then((mod) => mod.AdminPanelAccess),
  {
    ssr: false,
  },
);

const mobileNav = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/services", label: "Услуги", icon: Wrench },
  { href: "/account", label: "Кабинет", icon: UserRound },
];

export function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open || session) return;

    const controller = new AbortController();
    loadSession(controller.signal)
      .then(setSession)
      .catch(() => setSession({ user: null, adminAccess: null }));

    return () => controller.abort();
  }, [open, session]);

  const user = session?.user;
  const adminAccess = session?.adminAccess;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Открыть меню">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
        <DialogPrimitive.Content className="motion-gpu fixed inset-y-0 right-0 z-50 flex w-[min(88vw,360px)] flex-col border-l border-border bg-[#0A0A0A] p-5 shadow-2xl duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full lg:hidden">
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
                  onClick={() => setOpen(false)}
                  className={cn(
                    "focus-ring smooth-button flex min-h-12 items-center gap-3 rounded-md border px-4 text-base font-semibold",
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
            {user ? (
              <>
                {adminAccess?.isAdmin ? (
                  <AdminPanelAccess
                    variant="menu"
                    hasPassword={adminAccess.hasPassword}
                    hasAccess={adminAccess.hasAccess}
                  />
                ) : null}
                <Link
                  href="/account"
                  onClick={() => setOpen(false)}
                  className="focus-ring flex min-h-12 items-center gap-3 rounded-md border border-border bg-card px-4 text-sm font-medium text-white"
                >
                  <UserRound className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{user.email}</span>
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
                <Link href="/login" onClick={() => setOpen(false)}>
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
