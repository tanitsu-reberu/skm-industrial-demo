import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPanelAccess } from "@/components/admin-panel-access";
import { PageTransition } from "@/components/page-transition";
import { getAccountSnapshot, getAdminPanelAccessState } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/utils";
import { listPrivacyRequests } from "@/lib/privacy";
import { PrivacyCenter } from "@/components/privacy-center";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Личный кабинет | СКМ",
  robots: {
    index: false,
    follow: false,
  },
};

const requestStatusLabels = {
  pending: "Новая",
  processing: "В работе",
  invoice_sent: "Счёт отправлен",
  paid: "Оплачено",
  completed: "Завершено",
};

const orderStatusLabels: Record<string, string> = {
  new: "Новый",
  in_discussion: "Обсуждение",
  price_agreed: "Сумма согласована",
  in_progress: "В работе",
  completed: "Работы завершены",
  paid: "Оплачен",
  cancelled: "Отменён",
  created: "Создан",
  awaiting_payment: "Ожидает оплаты",
};

const paymentMethodLabels: Record<string, string> = {
  invoice: "По счёту",
  balance: "С баланса",
  card: "Картой",
};

const invoiceTypeLabels: Record<string, string> = {
  prepayment: "Предоплата",
  remaining: "Остаток",
  full: "Полная оплата",
};

const invoiceStatusLabels: Record<string, string> = {
  pending: "Подготовлен",
  sent: "Счёт отправлен",
  paid: "Оплачен",
  cancelled: "Отменён",
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const [{ orders, invoices, serviceInvoiceRequests }, adminAccess, privacyRequests] = await Promise.all([
    getAccountSnapshot(user.id),
    getAdminPanelAccessState(),
    listPrivacyRequests(user.id),
  ]);

  return (
    <PageTransition>
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="break-all text-sm text-muted">{user.email}</p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-white sm:text-5xl">Личный кабинет</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Оплата услуг только по счёту. Детали заказа и итоговую стоимость согласуйте в онлайн-чате на сайте.
            </p>
          </div>
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href="/services">Заказать услугу</Link>
          </Button>
        </div>

        {adminAccess.isAdmin ? (
          <div className="mb-5">
            <AdminPanelAccess
              variant="banner"
              hasPassword={adminAccess.hasPassword}
              hasAccess={adminAccess.hasAccess}
            />
          </div>
        ) : null}

        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Мои заказы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.length ? (
              orders.map((order) => {
                const total = order.total_amount || order.amount;
                const percent = total > 0 ? Math.min(100, Math.round((order.paid_amount / total) * 100)) : 0;
                const orderInvoices = invoices.filter((invoice) => invoice.order_id === order.id);

                return (
                  <div key={order.id} className="rounded-md border border-border bg-surface p-4">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row">
                      <div>
                        <p className="font-medium leading-snug text-white">#{order.id} · {order.title || order.service_title}</p>
                        <p className="mt-1 text-sm text-muted">{formatDate(order.created_at)}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-display text-lg font-semibold text-white">{formatMoney(total)}</p>
                        <p className="text-xs uppercase tracking-wide text-muted">
                          {paymentMethodLabels[order.payment_method] ?? order.payment_method} · {orderStatusLabels[order.status] ?? order.status}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted">Оплачено</span>
                        <span className="font-medium text-white">
                          {formatMoney(order.paid_amount)} из {formatMoney(total)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#27272A]">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                      </div>
                    </div>

                    {orderInvoices.length ? (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted">Выставленные счета</p>
                        {orderInvoices.map((invoice) => (
                          <div
                            key={invoice.id}
                            className="flex flex-col justify-between gap-1 rounded-md border border-border bg-[#0A0A0A] p-3 sm:flex-row sm:items-center"
                          >
                            <p className="text-sm text-white">#{invoice.id} · {invoiceTypeLabels[invoice.type]}</p>
                            <p className="text-sm text-muted">
                              {formatMoney(invoice.amount)} · {invoiceStatusLabels[invoice.status]}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted">Заказов пока нет.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Заявки на оплату по счёту</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {serviceInvoiceRequests.length ? (
              serviceInvoiceRequests.map((request) => (
                <div key={request.id} className="rounded-md border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white">#{request.order_id} · {request.service_title}</p>
                      <p className="mt-1 text-sm text-muted">{formatDate(request.created_at)}</p>
                    </div>
                    <p className="shrink-0 text-xs uppercase tracking-wide text-muted">{requestStatusLabels[request.status]}</p>
                  </div>
                  <p className="mt-3 font-display text-lg font-semibold text-white">
                    {formatMoney(request.invoice_amount ?? request.requested_amount)}
                  </p>
                  {request.admin_comment ? <p className="mt-2 text-sm text-muted">Комментарий: {request.admin_comment}</p> : null}
                </div>
              ))
            ) : (
              <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted">
                Заявок пока нет. Оформите услугу и напишите в онлайн-чат для согласования счёта.
              </p>
            )}
          </CardContent>
        </Card>

        <PrivacyCenter requests={privacyRequests} />
      </main>
    </PageTransition>
  );
}
