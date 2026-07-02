import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTransition } from "@/components/page-transition";
import { TopUpForm } from "@/components/top-up-form";
import { getAccountSnapshot } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Личный кабинет | СКМ",
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const { orders, transactions, topupRequests } = await getAccountSnapshot(user.id);

  return (
    <PageTransition>
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-muted">{user.email}</p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-white sm:text-5xl">Личный кабинет</h1>
          </div>
          <Button asChild variant="secondary">
            <Link href="/services">Заказать услугу</Link>
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <CardHeader>
              <CardTitle>Баланс</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-4xl font-semibold text-white sm:text-5xl">{formatMoney(user.balance)}</p>
              <p className="mt-3 text-sm leading-6 text-muted">
                Пополнение проходит через заявку: менеджер сверит оплату и вручную зачислит средства.
              </p>
              <div className="mt-6">
                <TopUpForm />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>История заказов</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orders.length ? (
                orders.map((order) => (
                  <div key={order.id} className="rounded-md border border-border bg-surface p-4">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row">
                      <div>
                        <p className="font-medium text-white">#{order.id} · {order.service_title}</p>
                        <p className="mt-1 text-sm text-muted">{formatDate(order.created_at)}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-display text-lg font-semibold text-white">{formatMoney(order.amount)}</p>
                        <p className="text-xs uppercase tracking-wide text-muted">{order.payment_method} · {order.status}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted">Заказов пока нет.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Заявки на пополнение</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topupRequests.length ? (
                topupRequests.map((request) => (
                  <div key={request.id} className="rounded-md border border-border bg-surface p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display text-lg font-semibold text-white">{formatMoney(request.amount)}</p>
                      <p className="text-xs uppercase tracking-wide text-muted">{request.status}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted">{formatDate(request.created_at)}</p>
                    {request.comment ? <p className="mt-2 text-sm text-muted">{request.comment}</p> : null}
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted">Заявок пока нет.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Транзакции</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {transactions.length ? (
                transactions.map((transaction) => (
                  <div key={transaction.id} className="flex flex-col justify-between gap-2 rounded-md border border-border bg-surface p-4 sm:flex-row">
                    <div>
                      <p className="font-medium text-white">{transaction.description}</p>
                      <p className="mt-1 text-sm text-muted">{formatDate(transaction.created_at)}</p>
                    </div>
                    <p className={transaction.amount >= 0 ? "font-display text-lg font-semibold text-white" : "font-display text-lg font-semibold text-primary"}>
                      {transaction.amount >= 0 ? "+" : ""}{formatMoney(transaction.amount)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted">Транзакций пока нет.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </PageTransition>
  );
}
