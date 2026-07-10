"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { logoutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";

type SessionState = {
  user: {
    email: string;
    role: "admin" | "user";
  } | null;
  adminAccess: {
    isAdmin: boolean;
    hasPassword: boolean;
    hasAccess: boolean;
  } | null;
};

const AdminPanelAccess = dynamic(
  () => import("@/components/admin-panel-access").then((mod) => mod.AdminPanelAccess),
  {
    ssr: false,
  },
);

async function loadSession(signal?: AbortSignal): Promise<SessionState> {
  const response = await fetch("/api/session", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    return { user: null, adminAccess: null };
  }

  return response.json();
}

function SessionSkeleton() {
  return (
    <div className="hidden items-center gap-2 lg:flex" aria-hidden>
      <div className="h-11 w-24 animate-pulse rounded-md bg-card" />
    </div>
  );
}

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
    return <SessionSkeleton />;
  }

  const user = session.user;
  const adminAccess = session.adminAccess;

  return (
    <div className="hidden items-center gap-2 lg:flex">
      {user ? (
        <>
          {adminAccess?.isAdmin ? (
            <AdminPanelAccess hasPassword={adminAccess.hasPassword} hasAccess={adminAccess.hasAccess} />
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
        <Button asChild size="default">
          <Link href="/login">Войти</Link>
        </Button>
      )}
    </div>
  );
}

export type { SessionState };
export { loadSession };