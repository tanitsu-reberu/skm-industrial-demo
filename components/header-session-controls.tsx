"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { HeaderAuthPlaceholder } from "@/components/header-auth-placeholder";
import { logoutAction } from "@/lib/actions";
import { loadSession, type SessionState } from "@/lib/client-session";
import { Button } from "@/components/ui/button";

const AdminPanelAccess = dynamic(
  () => import("@/components/admin-panel-access").then((mod) => mod.AdminPanelAccess),
  {
    ssr: false,
  },
);

export function HeaderSessionControls() {
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      loadSession(controller.signal)
        .then(setSession)
        .catch(() => setSession({ user: null, adminAccess: null }));
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(load, { timeout: 2500 });
      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
        controller.abort();
      };
    }

    const timerId = globalThis.setTimeout(load, 1200);
    return () => {
      globalThis.clearTimeout(timerId);
      controller.abort();
    };
  }, []);

  if (session === null) {
    return <HeaderAuthPlaceholder />;
  }

  const user = session.user;
  const adminAccess = session.adminAccess;

  return (
    <div className="hidden shrink-0 items-center gap-1.5 lg:flex sm:gap-2">
      {user ? (
        <>
          {adminAccess?.isAdmin ? (
            <AdminPanelAccess hasPassword={adminAccess.hasPassword} hasAccess={adminAccess.hasAccess} />
          ) : null}
          <Button asChild variant="secondary" size="sm" className="max-w-[min(100%,12rem)] shrink-0">
            <Link href="/account" prefetch className="min-w-0">
              <UserRound className="h-4 w-4 shrink-0" />
              <span className="truncate">{user.email}</span>
            </Link>
          </Button>
          <form action={logoutAction} className="shrink-0">
            <Button variant="ghost" size="icon" aria-label="Выйти">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </>
      ) : (
        <Button asChild size="default" className="h-11 w-[5.25rem] shrink-0 px-4">
          <Link href="/login" prefetch>
            Войти
          </Link>
        </Button>
      )}
    </div>
  );
}
