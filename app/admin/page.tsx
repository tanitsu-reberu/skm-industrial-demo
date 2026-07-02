import { redirect } from "next/navigation";
import { AdminBalanceForm } from "@/components/admin-balance-form";
import { AdminDeleteUserForm } from "@/components/admin-delete-user-form";
import { PageTransition } from "@/components/page-transition";
import { getAdminSnapshot } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Админ | СКМ",
};

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/account");

  const { users, orders, topupRequests } = await getAdminSnapshot();

  return (
    <PageTransition>
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8">
          <p className="text-sm text-muted">Администратор: {user.email}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white sm:text-5xl">Админ-панель</h1>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Пользователи</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {users.map((item) => {
                const userOrders = orders.filter((order) => order.user_id === item.id);

                return (
                  <div key={item.id} className="rounded-md border border-border bg-surface p-4">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div>
                        <p className="font-medium text-white">{item.email}</p>
                        <p className="mt-1 text-sm text-muted">
                          Баланс: {formatMoney(item.balance)} · Заказов: {item.total_orders}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          Последнее пополнение: {item.last_topup_at ? formatDate(item.last_topup_at) : "нет"}
                        </p>
                      </div>
                      <AdminBalanceForm userId={item.id} />
                    </div>

                    <details className="mt-4 rounded-md border border-border bg-card p-3">
                      <summary className="cursor-pointer text-sm font-medium text-white">История заказов</summary>
                      <div className="mt-3 space-y-2">
                        {userOrders.length ? (
                          userOrders.map((order) => (
                            <div key={order.id} className="flex flex-col justify-between gap-2 rounded-sm border border-border bg-background p-3 sm:flex-row">
                              <span className="text-sm text-white">#{order.id} · {order.service_title}</span>
                              <span className="text-sm text-muted">{formatMoney(order.amount)} · {order.status}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted">Заказов нет.</p>
                        )}
                      </div>
                    </details>

                    {item.id !== user.id ? <AdminDeleteUserForm userId={item.id} /> : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Заявки на пополнение</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topupRequests.length ? (
                  topupRequests.map((request) => (
                    <div key={request.id} className="rounded-md border border-border bg-surface p-4">
                      <p className="font-medium text-white">{request.email}</p>
                      <div className="mt-2 flex items-center justify-between gap-3 text-sm text-muted">
                        <span>{formatMoney(request.amount)}</span>
                        <span>{request.status}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted">{formatDate(request.created_at)}</p>
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
                <CardTitle>Последние заказы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {orders.length ? (
                  orders.slice(0, 10).map((order) => (
                    <div key={order.id} className="rounded-md border border-border bg-surface p-4">
                      <p className="font-medium text-white">#{order.id} · {order.service_title}</p>
                      <div className="mt-2 flex items-center justify-between gap-3 text-sm text-muted">
                        <span>{formatDate(order.created_at)}</span>
                        <span>{formatMoney(order.amount)} · {order.status}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted">Заказов пока нет.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
