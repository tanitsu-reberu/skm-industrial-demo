"use client";

import { Home, Menu, Wrench, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const mobileNav = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/services", label: "Услуги", icon: Wrench },
];

export function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

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
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      if (focusable.length === 0) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
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

  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="shrink-0 md:hidden" aria-label="Открыть меню" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm" aria-label="Закрыть меню" onClick={() => setOpen(false)} />
          <aside ref={panelRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title" className="mobile-menu-panel absolute inset-y-0 right-0 flex w-[min(88vw,360px)] flex-col border-l border-border bg-[#0A0A0A] shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="mobile-navigation-title" className="font-display text-xl font-semibold text-white">Навигация</h2>
              <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" aria-label="Закрыть меню" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
            </div>
            <nav className="mt-8 grid gap-2">
              {mobileNav.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} prefetch onClick={() => setOpen(false)} className={cn("focus-ring smooth-button flex min-h-14 items-center gap-3 rounded-md border px-4 text-base font-semibold", active ? "border-primary bg-primary text-white shadow-red" : "border-border bg-card text-muted hover:border-primary/60 hover:text-white")}>
                    <Icon className="h-5 w-5 shrink-0" />{item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
