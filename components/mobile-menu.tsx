"use client";

import dynamic from "next/dynamic";
import { Home, LogIn, LogOut, Menu, UserRound, Wrench, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadSession, type SessionState } from "@/components/header-session-controls";
import { logoutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AdminPanelAccess = dynamic(
  () => import("@/components/admin-panel-access").then((mod) => mod.AdminPanelAccess),
  { ssr: false },
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
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const frameId = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

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
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Открыть меню"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm animate-in fade-in-0"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          />
          <aside
            ref={panelRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            className="mobile-menu-panel motion-gpu absolute inset-y-0 right-0 flex w-[min(88vw,360px)] flex-col border-l border-border bg-[#0A0A0A] shadow-2xl animate-in slide-in-from-right-full duration-200"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-primary">SKM</p>
                <h2 id="mobile-navigation-title" className="mt-1 font-display text-xl font-semibold text-white">
                  Навигация
                </h2>
              </div>
              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Закрыть меню"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <nav className="mt-8 grid gap-2">
              {mobileNav.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    onClick={() => setOpen(false)}
                    className={cn(
                      "focus-ring smooth-button flex min-h-14 items-center gap-3 rounded-md border px-4 text-base font-semibold sm:min-h-12",
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
                    className="focus-ring flex min-h-14 items-center gap-3 rounded-md border border-border bg-card px-4 text-sm font-medium text-white sm:min-h-12"
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
          </aside>
        </div>
      ) : null}
    </>
  );
}
