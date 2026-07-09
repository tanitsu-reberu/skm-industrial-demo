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

export function HeaderSessionControls() {
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal)
      .then(setSession)
      .catch(() => setSession({ user: null, adminAccess: null }));

    return () => controller.abort();
  }, []);

  const user = session?.user;
  const adminAccess = session?.adminAccess;

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
        <Button asChild size="sm">
          <Link href="/login">Войти</Link>
        </Button>
      )}
    </div>
  );
}

export type { SessionState };
export { loadSession };
