import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminPanelGate } from "@/components/admin-panel-gate";
import { AdminServicesManager } from "@/components/admin-services-manager";
import { getAllServicesForAdmin } from "@/lib/services-db";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { getAdminSnapshot, getAdminPanelAccessState } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { configuredAdminEmails } from "@/lib/site-config";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Админ | СКМ",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  const user = await getCurrentUser();
  const adminEmails = configuredAdminEmails();

  if (!user || user.role !== "admin") {
    return (
      <PageTransition>
        <main className="section-shell grid min-h-[calc(100vh-5rem)] place-items-center py-12">
          <div className="max-w-xl rounded-lg border border-border bg-card p-6 text-center sm:p-8">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <h1 className="mt-5 font-display text-3xl font-semibold text-white">Доступ запрещён</h1>
            <p className="mt-3 text-base leading-7 text-muted">
              Админ-панель доступна только администраторам. Войдите под почтой{" "}
              {adminEmails.length === 1 ? adminEmails[0] : adminEmails.join(", ")}.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link href="/login?next=/admin">Войти</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/">На главную</Link>
              </Button>
            </div>
          </div>
        </main>
      </PageTransition>
    );
  }

  const adminAccess = await getAdminPanelAccessState();
  if (!adminAccess.hasAccess) {
    return (
      <PageTransition>
        <AdminPanelGate hasPassword={adminAccess.hasPassword} />
      </PageTransition>
    );
  }

  const snapshot = await getAdminSnapshot();

  return (
    <PageTransition>
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm text-muted">Администратор: {user.email}</p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-white sm:text-5xl">Админ-панель</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted">
              Управление пользователями, заказами, счетами и заявками на оплату по счёту.
            </p>
          </div>
        </div>

        <AdminDashboard {...snapshot} currentAdminId={user.id} currentAdminEmail={user.email} />
      </main>
    </PageTransition>
  );
}
