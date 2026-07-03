"use client";

import { Children, type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Minus,
  Plus,
  Search,
  Trash2,
  WalletCards,
} from "lucide-react";
import {
  adminAdjustBalanceAction,
  adminUpdateServiceInvoiceRequestAction,
  adminUpdateTopupRequestAction,
  deleteContactRequestAction,
  deleteUserAction,
  updateContactRequestStatusAction,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputWithIcon } from "@/components/ui/input-with-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";

type AdminUser = {
  id: number;
  email: string;
  role: "user" | "admin";
  balance: number;
  created_at: string;
  updated_at: string;
  last_topup_at: string | null;
  last_activity_at: string | null;
  last_order_at: string | null;
  last_order_title: string | null;
  total_orders: number;
  total_spent: number;
};

type AdminOrder = {
  id: number;
  user_id: number;
  service_title: string;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
};

type AdminTransaction = {
  id: number;
  user_id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
};

type TopupStatus = "pending" | "processing" | "invoice_sent" | "paid" | "completed";
type ContactRequestStatus = "new" | "in_progress" | "processed";

type AdminTopupRequest = {
  id: number;
  user_id: number;
  email: string;
  requested_amount: number;
  invoice_amount: number | null;
  status: TopupStatus;
  user_comment: string | null;
  admin_comment: string | null;
  processed_by_email: string | null;
  invoice_sent_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type AdminServiceInvoiceRequest = AdminTopupRequest & {
  order_id: number;
  service_slug: string;
  service_title: string;
};

type AdminDashboardProps = {
  users: AdminUser[];
  orders: AdminOrder[];
  transactions: AdminTransaction[];
  topupRequests: AdminTopupRequest[];
  serviceInvoiceRequests: AdminServiceInvoiceRequest[];
  contactRequests: AdminContactRequest[];
  totalUsers: number;
  totalBalance: number;
  totalOrders: number;
  currentAdminId: number;
  currentAdminEmail: string;
};

type AdminContactRequest = {
  id: number;
  name: string | null;
  phone: string;
  comment: string;
  status: ContactRequestStatus;
  created_at: string;
  updated_at: string;
};

type SortKey = "created_at" | "balance";
type SortDirection = "asc" | "desc";
type TopupAction = "start_processing" | "send_invoice" | "mark_paid" | "confirm_payment";

const pageSize = 8;
const topupStatusOrder: TopupStatus[] = ["pending", "processing", "invoice_sent", "paid", "completed"];

const statusLabels: Record<TopupStatus, string> = {
  pending: "Новая заявка",
  processing: "В обработке",
  invoice_sent: "Счёт отправлен",
  paid: "Оплачено",
  completed: "Зачислено",
};

const contactStatusLabels: Record<ContactRequestStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  processed: "Обработана",
};

export function AdminDashboard({
  users,
  orders,
  transactions,
  topupRequests,
  serviceInvoiceRequests,
  contactRequests,
  totalUsers,
  totalBalance,
  totalOrders,
  currentAdminId,
  currentAdminEmail,
}: AdminDashboardProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [page, setPage] = useState(1);
  const [activeTopupStatus, setActiveTopupStatus] = useState<TopupStatus>("pending");
  const [activeInvoiceStatus, setActiveInvoiceStatus] = useState<TopupStatus>("pending");
  const [localTopupRequests, setLocalTopupRequests] = useState(topupRequests);
  const [localServiceInvoiceRequests, setLocalServiceInvoiceRequests] = useState(serviceInvoiceRequests);

  useEffect(() => {
    setLocalTopupRequests(topupRequests);
  }, [topupRequests]);

  useEffect(() => {
    setLocalServiceInvoiceRequests(serviceInvoiceRequests);
  }, [serviceInvoiceRequests]);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const pendingTopups = localTopupRequests.filter((request) => request.status === "pending").length;
  const pendingServiceInvoices = localServiceInvoiceRequests.filter((request) => request.status === "pending").length;
  const pendingBillingRequests = pendingTopups + pendingServiceInvoices;
  const pendingContactRequests = contactRequests.filter((request) => request.status === "new").length;

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users
      .filter((user) => (normalizedQuery ? user.email.toLowerCase().includes(normalizedQuery) : true))
      .sort((left, right) => {
        const leftValue = sortKey === "balance" ? left.balance : new Date(left.created_at).getTime();
        const rightValue = sortKey === "balance" ? right.balance : new Date(right.created_at).getTime();
        return sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
      });
  }, [query, sortDirection, sortKey, users]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function toggleSort(nextKey: SortKey) {
    setPage(1);
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("desc");
  }

  async function exportUsersToExcel() {
    const XLSX = await import("xlsx");
    const rows = users.map((user) => ({
      Email: user.email,
      "Баланс": user.balance,
      "Дата регистрации": formatDate(user.created_at),
      "Последняя активность": user.last_activity_at ? formatDate(user.last_activity_at) : "Нет данных",
      "Количество заказов": user.total_orders,
      "Последний заказ": user.last_order_title ?? "Нет данных",
      "Дата последнего заказа": user.last_order_at ? formatDate(user.last_order_at) : "Нет данных",
      "Всего потрачено": user.total_spent,
      Роль: user.role,
    }));

    writeWorkbook(XLSX, rows, `users_export_${dateStamp()}.xlsx`, "Пользователи");
  }

  async function exportOrdersToExcel() {
    const XLSX = await import("xlsx");
    const rows = orders.map((order) => {
      const orderUser = userById.get(order.user_id);

      return {
        "Email пользователя": orderUser?.email ?? "Пользователь удалён",
        "Название услуги": order.service_title,
        Сумма: order.amount,
        "Дата заказа": formatDate(order.created_at),
        "Статус заказа": order.status,
        "Способ оплаты": order.payment_method || "Нет данных",
      };
    });

    writeWorkbook(XLSX, rows, `orders_export_${dateStamp()}.xlsx`, "Заказы");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Всего пользователей" value={totalUsers.toLocaleString("ru-RU")} />
        <StatCard label="Общая сумма на балансах" value={formatMoney(totalBalance)} />
        <StatCard label="Общее количество заказов" value={totalOrders.toLocaleString("ru-RU")} />
        <StatCard
          label="Новые заявки"
          value={pendingContactRequests.toLocaleString("ru-RU")}
          accent
          onClick={() => document.getElementById("contact-requests")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <StatCard
          label="Новые запросы на пополнение"
          value={pendingBillingRequests.toLocaleString("ru-RU")}
          accent
          onClick={() => {
            setActiveTopupStatus("pending");
            setActiveInvoiceStatus("pending");
          }}
        />
      </div>

      <ContactRequestsPanel initialRequests={contactRequests} />

      <TopupRequestsPanel
        requests={localTopupRequests}
        activeStatus={activeTopupStatus}
        adminEmail={currentAdminEmail}
        onStatusChange={setActiveTopupStatus}
        onRequestUpdate={(updatedRequest) => {
          setLocalTopupRequests((current) =>
            current.map((request) => (request.id === updatedRequest.id ? updatedRequest : request)),
          );
        }}
      />

      <ServiceInvoiceRequestsPanel
        requests={localServiceInvoiceRequests}
        activeStatus={activeInvoiceStatus}
        adminEmail={currentAdminEmail}
        onStatusChange={setActiveInvoiceStatus}
        onRequestUpdate={(updatedRequest) => {
          setLocalServiceInvoiceRequests((current) =>
            current.map((request) => (request.id === updatedRequest.id ? updatedRequest : request)),
          );
        }}
      />

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 xl:max-w-md xl:shrink-0">
            <h2 className="font-display text-2xl font-semibold text-white">Пользователи</h2>
            <p className="mt-1 text-sm leading-6 text-muted">Поиск, сортировка, быстрый баланс, удаление и экспорт.</p>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-3 xl:w-auto xl:max-w-xl xl:shrink-0 xl:flex-row xl:items-center">
            <InputWithIcon
              icon={Search}
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Поиск по email"
              wrapperClassName="w-full min-w-0 xl:w-80"
            />
            <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:flex">
              <Button type="button" variant="secondary" onClick={exportUsersToExcel}>
                <Download className="h-4 w-4" />
                Экспорт пользователей в Excel
              </Button>
              <Button type="button" variant="secondary" onClick={exportOrdersToExcel}>
                <Download className="h-4 w-4" />
                Экспорт всех заказов в Excel
              </Button>
            </div>
          </div>
        </div>

        <div className="hidden xl:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Email</TableHead>
                <TableHead>
                  <SortButton active={sortKey === "balance"} direction={sortDirection} onClick={() => toggleSort("balance")}>
                    Баланс
                  </SortButton>
                </TableHead>
                <TableHead>
                  <SortButton active={sortKey === "created_at"} direction={sortDirection} onClick={() => toggleSort("created_at")}>
                    Дата регистрации
                  </SortButton>
                </TableHead>
                <TableHead>Последняя активность</TableHead>
                <TableHead>Последний заказ</TableHead>
                <TableHead className="text-right">Всего потрачено</TableHead>
                <TableHead className="text-right">Заказы</TableHead>
                <TableHead>Быстрый баланс</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedUsers.map((user) => (
                <TableRow key={user.id} onClick={() => setSelectedUserId(user.id)} className="cursor-pointer">
                  <TableCell>
                    <p className="font-medium text-white">{user.email}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted">{user.role}</p>
                  </TableCell>
                  <TableCell className="font-display text-lg font-semibold text-white">{formatMoney(user.balance)}</TableCell>
                  <TableCell className="text-muted">{formatDate(user.created_at)}</TableCell>
                  <TableCell className="text-muted">{user.last_activity_at ? formatDate(user.last_activity_at) : "Нет данных"}</TableCell>
                  <TableCell>
                    <p className="max-w-52 truncate font-medium text-white">{user.last_order_title ?? "Нет данных"}</p>
                    {user.last_order_at ? <p className="mt-1 text-xs text-muted">{formatDate(user.last_order_at)}</p> : null}
                  </TableCell>
                  <TableCell className="text-right font-display text-lg font-semibold text-white">{formatMoney(user.total_spent)}</TableCell>
                  <TableCell className="text-right font-medium text-white">{user.total_orders}</TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <QuickBalanceControl userId={user.id} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    {user.id !== currentAdminId ? (
                      <Button type="button" variant="ghost" size="icon" aria-label="Удалить пользователя" onClick={() => setDeleteTarget(user)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 p-4 xl:hidden">
          {paginatedUsers.map((user) => (
            <div key={user.id} className="rounded-md border border-border bg-surface p-4">
              <button type="button" onClick={() => setSelectedUserId(user.id)} className="focus-ring block w-full rounded-sm text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{user.email}</p>
                    <p className="mt-1 text-sm text-muted">{formatDate(user.created_at)}</p>
                  </div>
                  <p className="shrink-0 font-display text-lg font-semibold text-white">{formatMoney(user.balance)}</p>
                </div>
                <p className="mt-3 text-sm text-muted">Последний заказ: {user.last_order_title ?? "Нет данных"}</p>
                <p className="mt-1 text-sm text-muted">
                  Заказов: {user.total_orders} · Потрачено: {formatMoney(user.total_spent)}
                </p>
              </button>
              <div className="mt-4 grid gap-3">
                <QuickBalanceControl userId={user.id} />
                {user.id !== currentAdminId ? (
                  <Button type="button" variant="outline" onClick={() => setDeleteTarget(user)}>
                    <Trash2 className="h-4 w-4" />
                    Удалить пользователя
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {filteredUsers.length === 0 ? (
          <div className="border-t border-border p-6 text-center text-sm text-muted">Пользователи не найдены.</div>
        ) : null}

        <PaginationControls
          currentPage={currentPage}
          pageCount={pageCount}
          total={filteredUsers.length}
          onPrev={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(pageCount, value + 1))}
        />
      </div>

      <UserDialog
        user={selectedUser}
        orders={orders.filter((order) => order.user_id === selectedUser?.id)}
        transactions={transactions.filter((transaction) => transaction.user_id === selectedUser?.id)}
        topupRequests={localTopupRequests.filter((request) => request.user_id === selectedUser?.id)}
        serviceInvoiceRequests={localServiceInvoiceRequests.filter((request) => request.user_id === selectedUser?.id)}
        currentAdminId={currentAdminId}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
      />

      <DeleteConfirmDialog
        user={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function ContactRequestsPanel({ initialRequests }: { initialRequests: AdminContactRequest[] }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [selectedRequest, setSelectedRequest] = useState<AdminContactRequest | null>(null);
  const [activeStatus, setActiveStatus] = useState<ContactRequestStatus>("new");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  const counts = useMemo(
    () => ({
      new: requests.filter((request) => request.status === "new").length,
      in_progress: requests.filter((request) => request.status === "in_progress").length,
      processed: requests.filter((request) => request.status === "processed").length,
    }),
    [requests],
  );

  const visibleRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return requests
      .filter((request) => request.status === activeStatus)
      .filter((request) => {
        if (!normalizedQuery) return true;
        return [request.name, request.phone, request.comment, String(request.id)]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));
      });
  }, [activeStatus, query, requests]);

  function updateStatus(request: AdminContactRequest, status: ContactRequestStatus) {
    const formData = new FormData();
    formData.set("requestId", String(request.id));
    formData.set("status", status);

    startTransition(async () => {
      const result = await updateContactRequestStatusAction(formData);
      setMessage(result.message);
      if (result.ok) {
        const updated = { ...request, status, updated_at: new Date().toISOString() };
        setRequests((current) => current.map((item) => (item.id === request.id ? updated : item)));
        setSelectedRequest(updated);
        setActiveStatus(status);
        router.refresh();
      }
    });
  }

  function deleteRequest(request: AdminContactRequest) {
    if (!window.confirm(`Удалить заявку #${request.id}?`)) return;

    const formData = new FormData();
    formData.set("requestId", String(request.id));

    startTransition(async () => {
      const result = await deleteContactRequestAction(formData);
      setMessage(result.message);
      if (result.ok) {
        setRequests((current) => current.filter((item) => item.id !== request.id));
        setSelectedRequest(null);
        router.refresh();
      }
    });
  }

  const newCount = counts.new;

  return (
    <section id="contact-requests" className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold text-white">Заявки</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Обращения из формы на сайте: просмотр, статус и удаление.</p>
        </div>
        <span className="shrink-0 rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm font-semibold text-white">
          Новых: {newCount}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 xl:max-w-[calc(100%-22rem)]">
          {(["new", "in_progress", "processed"] as ContactRequestStatus[]).map((status) => {
            const active = activeStatus === status;

            return (
              <button
                type="button"
                key={status}
                onClick={() => setActiveStatus(status)}
                className={
                  active
                    ? "focus-ring flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white shadow-red"
                    : "focus-ring flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-muted transition-colors hover:border-primary/60 hover:text-white"
                }
              >
                {contactStatusLabels[status]}
                <span className={active ? "rounded bg-white/20 px-2 py-0.5 text-xs text-white" : "rounded bg-card px-2 py-0.5 text-xs text-muted"}>
                  {counts[status]}
                </span>
              </button>
            );
          })}
        </div>
        <InputWithIcon
          icon={Search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по имени, телефону или комментарию"
          wrapperClassName="w-full min-w-0 shrink-0 xl:w-96"
        />
      </div>

      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Контакт</TableHead>
              <TableHead>Комментарий</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRequests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>
                  <p className="font-medium text-white">{request.name || "Без имени"}</p>
                  <p className="mt-1 text-sm text-muted">{request.phone}</p>
                </TableCell>
                <TableCell>
                  <p className="max-w-xl truncate text-sm text-muted">{request.comment}</p>
                </TableCell>
                <TableCell>
                  <ContactStatusPill status={request.status} />
                </TableCell>
                <TableCell className="text-muted">{formatDate(request.created_at)}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="secondary" onClick={() => setSelectedRequest(request)}>
                    <FileText className="h-4 w-4" />
                    Открыть
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 p-4 lg:hidden">
        {visibleRequests.map((request) => (
          <button
            key={request.id}
            type="button"
            onClick={() => setSelectedRequest(request)}
            className="focus-ring rounded-md border border-border bg-surface p-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-white">{request.name || "Без имени"}</p>
                <p className="mt-1 text-sm text-muted">{request.phone}</p>
              </div>
              <ContactStatusPill status={request.status} />
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{request.comment}</p>
          </button>
        ))}
      </div>

      {visibleRequests.length === 0 ? <p className="p-4 text-sm text-muted">В этой вкладке заявок пока нет.</p> : null}

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selectedRequest ? (
            <>
              <DialogHeader>
                <DialogTitle>Заявка #{selectedRequest.id}</DialogTitle>
                <DialogDescription>
                  {selectedRequest.name || "Без имени"} · {selectedRequest.phone} · {formatDate(selectedRequest.created_at)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-surface p-4">
                  <ContactStatusPill status={selectedRequest.status} />
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">{selectedRequest.comment}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || selectedRequest.status === "new"}
                    onClick={() => updateStatus(selectedRequest, "new")}
                  >
                    Новая
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || selectedRequest.status === "in_progress"}
                    onClick={() => updateStatus(selectedRequest, "in_progress")}
                  >
                    В работе
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending || selectedRequest.status === "processed"}
                    onClick={() => updateStatus(selectedRequest, "processed")}
                  >
                    Обработана
                  </Button>
                </div>
                <Button type="button" variant="outline" disabled={isPending} onClick={() => deleteRequest(selectedRequest)}>
                  <Trash2 className="h-4 w-4" />
                  Удалить заявку
                </Button>
                {message ? <p className="rounded-md border border-border bg-surface p-3 text-sm text-muted">{message}</p> : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ContactStatusPill({ status }: { status: ContactRequestStatus }) {
  const active = status === "new";

  return (
    <span className={active ? "rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white" : "rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted"}>
      {contactStatusLabels[status]}
    </span>
  );
}

function StatCard({ label, value, accent, onClick }: { label: string; value: string; accent?: boolean; onClick?: () => void }) {
  const className = accent
    ? "rounded-lg border border-primary/60 bg-primary/10 p-5 transition-colors hover:border-primary"
    : "rounded-lg border border-border bg-card p-5";
  const content = (
    <>
      <p className={accent ? "text-sm text-white/80" : "text-sm text-muted"}>{label}</p>
      <p className="mt-2 font-display text-4xl font-semibold text-white">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} focus-ring text-left`}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function TopupRequestsPanel({
  requests,
  activeStatus,
  adminEmail,
  onStatusChange,
  onRequestUpdate,
}: {
  requests: AdminTopupRequest[];
  activeStatus: TopupStatus;
  adminEmail: string;
  onStatusChange: (status: TopupStatus) => void;
  onRequestUpdate: (request: AdminTopupRequest) => void;
}) {
  const [selectedRequest, setSelectedRequest] = useState<AdminTopupRequest | null>(null);
  const [query, setQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const selectedRequestId = selectedRequest?.id;

  useEffect(() => {
    if (!selectedRequestId) return;
    const fresh = requests.find((item) => item.id === selectedRequestId);
    if (fresh) setSelectedRequest(fresh);
  }, [requests, selectedRequestId]);

  const counts = useMemo(
    () =>
      topupStatusOrder.reduce(
        (acc, status) => ({
          ...acc,
          [status]: requests.filter((request) => request.status === status).length,
        }),
        {} as Record<TopupStatus, number>,
      ),
    [requests],
  );
  const visibleRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return requests
      .filter((request) => request.status === activeStatus)
      .filter((request) => {
        if (!normalizedQuery) return true;
        return request.email.toLowerCase().includes(normalizedQuery) || String(request.id).includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftDate = new Date(left.created_at).getTime();
        const rightDate = new Date(right.created_at).getTime();
        return sortDirection === "asc" ? leftDate - rightDate : rightDate - leftDate;
      });
  }, [activeStatus, query, requests, sortDirection]);

  function updateRequest(request: AdminTopupRequest) {
    setSelectedRequest(request);
    onRequestUpdate(request);
    onStatusChange(request.status);
  }

  return (
    <section id="topup-requests" className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold text-white">Запросы на пополнение</h2>
          <p className="mt-1 text-sm leading-6 text-muted">По умолчанию показаны новые заявки. Переключайтесь по статусам для обработки очереди.</p>
        </div>
        <button
          type="button"
          onClick={() => onStatusChange("pending")}
          className="focus-ring shrink-0 rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:border-primary"
        >
          Новых: {requests.filter((request) => request.status === "pending").length}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border p-4">
        {topupStatusOrder.map((status) => {
          const active = activeStatus === status;

          return (
            <button
              type="button"
              key={status}
              onClick={() => onStatusChange(status)}
              className={
                active
                  ? "focus-ring flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white shadow-red"
                  : "focus-ring flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-muted transition-colors hover:border-primary/60 hover:text-white"
              }
            >
              {statusLabels[status]}
              <span className={active ? "rounded bg-white/20 px-2 py-0.5 text-xs text-white" : "rounded bg-card px-2 py-0.5 text-xs text-muted"}>
                {counts[status]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <InputWithIcon
          icon={Search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по email или номеру"
          wrapperClassName="w-full min-w-0 sm:max-w-sm sm:flex-1"
        />
        <Button type="button" className="w-full shrink-0 whitespace-nowrap sm:w-auto" variant="secondary" onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}>
          <ArrowDownUp className="h-4 w-4" />
          Дата {sortDirection === "asc" ? "↑" : "↓"}
        </Button>
      </div>

      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Пользователь</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Создана</TableHead>
              <TableHead>Администратор</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRequests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>
                  <p className="font-medium text-white">{request.email}</p>
                  <p className="mt-1 text-xs text-muted">#{request.id}</p>
                </TableCell>
                <TableCell>
                  <p className="font-display text-lg font-semibold text-white">{formatMoney(request.invoice_amount ?? request.requested_amount)}</p>
                  <p className="mt-1 text-xs text-muted">Запрошено: {formatMoney(request.requested_amount)}</p>
                </TableCell>
                <TableCell>
                  <StatusPill status={request.status} />
                </TableCell>
                <TableCell className="text-muted">{formatDate(request.created_at)}</TableCell>
                <TableCell className="text-muted">{request.processed_by_email ?? "Нет данных"}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="secondary" onClick={() => setSelectedRequest(request)}>
                    <FileText className="h-4 w-4" />
                    Открыть
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 p-4 lg:hidden">
        {visibleRequests.map((request) => (
          <button
            type="button"
            key={request.id}
            onClick={() => setSelectedRequest(request)}
            className="focus-ring rounded-md border border-border bg-surface p-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{request.email}</p>
                <p className="mt-1 text-sm text-muted">{formatDate(request.created_at)}</p>
              </div>
              <StatusPill status={request.status} />
            </div>
            <p className="mt-3 font-display text-lg font-semibold text-white">
              {formatMoney(request.invoice_amount ?? request.requested_amount)}
            </p>
          </button>
        ))}
      </div>

      {visibleRequests.length === 0 ? <p className="p-4 text-sm text-muted">В этой вкладке заявок пока нет.</p> : null}

      <TopupRequestDialog
        request={selectedRequest}
        adminEmail={adminEmail}
        onRequestUpdate={updateRequest}
        onOpenChange={(open) => !open && setSelectedRequest(null)}
      />
    </section>
  );
}

function ServiceInvoiceRequestsPanel({
  requests,
  activeStatus,
  adminEmail,
  onStatusChange,
  onRequestUpdate,
}: {
  requests: AdminServiceInvoiceRequest[];
  activeStatus: TopupStatus;
  adminEmail: string;
  onStatusChange: (status: TopupStatus) => void;
  onRequestUpdate: (request: AdminServiceInvoiceRequest) => void;
}) {
  const [selectedRequest, setSelectedRequest] = useState<AdminServiceInvoiceRequest | null>(null);
  const [query, setQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const selectedRequestId = selectedRequest?.id;

  useEffect(() => {
    if (!selectedRequestId) return;
    const fresh = requests.find((item) => item.id === selectedRequestId);
    if (fresh) setSelectedRequest(fresh);
  }, [requests, selectedRequestId]);

  const counts = useMemo(
    () =>
      topupStatusOrder.reduce(
        (acc, status) => ({
          ...acc,
          [status]: requests.filter((request) => request.status === status).length,
        }),
        {} as Record<TopupStatus, number>,
      ),
    [requests],
  );

  const visibleRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return requests
      .filter((request) => request.status === activeStatus)
      .filter((request) => {
        if (!normalizedQuery) return true;
        return (
          request.email.toLowerCase().includes(normalizedQuery) ||
          request.service_title.toLowerCase().includes(normalizedQuery) ||
          String(request.order_id).includes(normalizedQuery) ||
          String(request.id).includes(normalizedQuery)
        );
      })
      .sort((left, right) => {
        const leftDate = new Date(left.created_at).getTime();
        const rightDate = new Date(right.created_at).getTime();
        return sortDirection === "asc" ? leftDate - rightDate : rightDate - leftDate;
      });
  }, [activeStatus, query, requests, sortDirection]);

  function updateRequest(request: AdminServiceInvoiceRequest) {
    setSelectedRequest(request);
    onRequestUpdate(request);
    onStatusChange(request.status);
  }

  return (
    <section id="service-invoice-requests" className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border p-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Заявки на оплату услуг по счёту</h2>
          <p className="mt-1 text-sm text-muted">
            Отдельная очередь для заказов, где клиент выбрал оплату по счёту: обработка, отправка счёта и подтверждение оплаты.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onStatusChange("pending")}
          className="focus-ring rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:border-primary"
        >
          Новых: {requests.filter((request) => request.status === "pending").length}
        </button>
      </div>

      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 xl:max-w-[calc(100%-20rem)]">
          {topupStatusOrder.map((status) => {
            const active = activeStatus === status;

            return (
              <button
                type="button"
                key={status}
                onClick={() => onStatusChange(status)}
                className={
                  active
                    ? "focus-ring flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white shadow-red"
                    : "focus-ring flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-muted transition-colors hover:border-primary/60 hover:text-white"
                }
              >
                {statusLabels[status]}
                <span className={active ? "rounded bg-white/20 px-2 py-0.5 text-xs text-white" : "rounded bg-card px-2 py-0.5 text-xs text-muted"}>
                  {counts[status]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <InputWithIcon
            icon={Search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по email, услуге или номеру"
            wrapperClassName="w-full min-w-0 sm:w-80"
          />
          <Button type="button" className="w-full shrink-0 whitespace-nowrap sm:w-auto" variant="secondary" onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}>
            <ArrowDownUp className="h-4 w-4" />
            Дата {sortDirection === "asc" ? "↑" : "↓"}
          </Button>
        </div>
      </div>

      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Клиент</TableHead>
              <TableHead>Услуга</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Создана</TableHead>
              <TableHead>Администратор</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRequests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>
                  <p className="font-medium text-white">{request.email}</p>
                  <p className="mt-1 text-xs text-muted">Заявка #{request.id} · заказ #{request.order_id}</p>
                </TableCell>
                <TableCell>
                  <p className="max-w-72 truncate font-medium text-white">{request.service_title}</p>
                  <p className="mt-1 text-xs text-muted">{request.service_slug}</p>
                </TableCell>
                <TableCell>
                  <p className="font-display text-lg font-semibold text-white">{formatMoney(request.invoice_amount ?? request.requested_amount)}</p>
                  <p className="mt-1 text-xs text-muted">Запрошено: {formatMoney(request.requested_amount)}</p>
                </TableCell>
                <TableCell>
                  <StatusPill status={request.status} />
                </TableCell>
                <TableCell className="text-muted">{formatDate(request.created_at)}</TableCell>
                <TableCell className="text-muted">{request.processed_by_email ?? "Нет данных"}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="secondary" onClick={() => setSelectedRequest(request)}>
                    <FileText className="h-4 w-4" />
                    Открыть
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 p-4 lg:hidden">
        {visibleRequests.map((request) => (
          <button
            type="button"
            key={request.id}
            onClick={() => setSelectedRequest(request)}
            className="focus-ring rounded-md border border-border bg-surface p-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{request.email}</p>
                <p className="mt-1 text-sm text-muted">Заказ #{request.order_id} · {formatDate(request.created_at)}</p>
              </div>
              <StatusPill status={request.status} />
            </div>
            <p className="mt-3 font-medium text-white">{request.service_title}</p>
            <p className="mt-2 font-display text-lg font-semibold text-white">
              {formatMoney(request.invoice_amount ?? request.requested_amount)}
            </p>
          </button>
        ))}
      </div>

      {visibleRequests.length === 0 ? <p className="p-4 text-sm text-muted">В этой вкладке заявок пока нет.</p> : null}

      <ServiceInvoiceRequestDialog
        request={selectedRequest}
        adminEmail={adminEmail}
        onRequestUpdate={updateRequest}
        onOpenChange={(open) => !open && setSelectedRequest(null)}
      />
    </section>
  );
}

function ServiceInvoiceRequestDialog({
  request,
  adminEmail,
  onRequestUpdate,
  onOpenChange,
}: {
  request: AdminServiceInvoiceRequest | null;
  adminEmail: string;
  onRequestUpdate: (request: AdminServiceInvoiceRequest) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [adminComment, setAdminComment] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setInvoiceAmount(request?.invoice_amount ? String(request.invoice_amount) : "");
    setAdminComment(request?.admin_comment ?? "");
    setMessage("");
  }, [request?.id, request?.invoice_amount, request?.admin_comment]);

  function submit(action: TopupAction) {
    if (!request) return;

    const formData = new FormData();
    formData.set("requestId", String(request.id));
    formData.set("action", action);
    formData.set("invoiceAmount", invoiceAmount || String(request.invoice_amount ?? request.requested_amount));
    formData.set("adminComment", adminComment || request.admin_comment || "");

    startTransition(async () => {
      try {
        const result = await adminUpdateServiceInvoiceRequestAction(formData);
        setMessage(result.message);
        if (result.ok) {
          const updated = result.requestStatus
            ? { ...applyServiceInvoiceAction(request, action, invoiceAmount, adminComment, adminEmail), status: result.requestStatus }
            : applyServiceInvoiceAction(request, action, invoiceAmount, adminComment, adminEmail);
          onRequestUpdate(updated);
          router.refresh();
        }
      } catch (error) {
        console.error("[SKM Admin] service invoice action failed", error);
        setMessage("Не удалось обновить заявку. Попробуйте ещё раз.");
      }
    });
  }

  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) {
          setInvoiceAmount("");
          setAdminComment("");
          setMessage("");
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {request ? (
          <>
            <DialogHeader>
              <DialogTitle>Счёт по заказу #{request.order_id}</DialogTitle>
              <DialogDescription>
                {request.email} · {statusLabels[request.status]} · {request.service_title}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-md border border-border bg-surface p-4 text-sm leading-6 text-muted">
                <p>Создана: {formatDate(request.created_at)}</p>
                <p>Запрошенная сумма: {formatMoney(request.requested_amount)}</p>
                {request.invoice_amount ? <p>Сумма счёта: {formatMoney(request.invoice_amount)}</p> : null}
                {request.invoice_sent_at ? <p className="mt-1">Счёт отправлен: {formatDate(request.invoice_sent_at)}</p> : null}
                {request.paid_at ? <p className="mt-1">Оплата отмечена: {formatDate(request.paid_at)}</p> : null}
                {request.completed_at ? <p className="mt-1">Завершена: {formatDate(request.completed_at)}</p> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={invoiceAmount}
                  onChange={(event) => setInvoiceAmount(event.target.value)}
                  inputMode="numeric"
                  placeholder={`Сумма счёта, ₽ (${request.invoice_amount ?? request.requested_amount})`}
                />
                <Input
                  value={adminComment}
                  onChange={(event) => setAdminComment(event.target.value)}
                  placeholder={request.admin_comment ?? "Комментарий администратора"}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <Button type="button" variant="secondary" disabled={isPending || request.status !== "pending"} onClick={() => submit("start_processing")}>
                  Взять в работу
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending || (request.status !== "processing" && request.status !== "invoice_sent")}
                  onClick={() => submit("send_invoice")}
                >
                  Счёт отправлен
                </Button>
                <Button type="button" variant="secondary" disabled={isPending || request.status !== "invoice_sent"} onClick={() => submit("mark_paid")}>
                  Отметить оплачено
                </Button>
                <Button type="button" disabled={isPending || request.status !== "paid"} onClick={() => submit("confirm_payment")}>
                  Завершить
                </Button>
              </div>

              {message ? <p className="rounded-md border border-border bg-surface p-3 text-sm text-muted">{message}</p> : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function applyServiceInvoiceAction(
  request: AdminServiceInvoiceRequest,
  action: TopupAction,
  invoiceAmount: string,
  adminComment: string,
  adminEmail: string,
): AdminServiceInvoiceRequest {
  return applyTopupAction(request, action, invoiceAmount, adminComment, adminEmail) as AdminServiceInvoiceRequest;
}

function StatusPill({ status }: { status: TopupStatus }) {
  const active = status === "pending" || status === "processing";

  return (
    <span className={active ? "rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white" : "rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted"}>
      {statusLabels[status]}
    </span>
  );
}

function TopupRequestDialog({
  request,
  adminEmail,
  onRequestUpdate,
  onOpenChange,
}: {
  request: AdminTopupRequest | null;
  adminEmail: string;
  onRequestUpdate: (request: AdminTopupRequest) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [adminComment, setAdminComment] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setInvoiceAmount(request?.invoice_amount ? String(request.invoice_amount) : "");
    setAdminComment(request?.admin_comment ?? "");
    setMessage("");
  }, [request?.id, request?.invoice_amount, request?.admin_comment]);

  function submit(action: TopupAction) {
    if (!request) return;

    const formData = new FormData();
    formData.set("requestId", String(request.id));
    formData.set("action", action);
    formData.set("invoiceAmount", invoiceAmount || String(request.invoice_amount ?? request.requested_amount));
    formData.set("adminComment", adminComment || request.admin_comment || "");

    startTransition(async () => {
      try {
        const result = await adminUpdateTopupRequestAction(formData);
        setMessage(result.message);
        if (result.ok) {
          const updated = result.requestStatus
            ? { ...applyTopupAction(request, action, invoiceAmount, adminComment, adminEmail), status: result.requestStatus }
            : applyTopupAction(request, action, invoiceAmount, adminComment, adminEmail);
          onRequestUpdate(updated);
          router.refresh();
        }
      } catch (error) {
        console.error("[SKM Admin] topup action failed", error);
        setMessage("Не удалось обновить заявку. Попробуйте ещё раз.");
      }
    });
  }

  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) {
          setInvoiceAmount("");
          setAdminComment("");
          setMessage("");
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {request ? (
          <>
            <DialogHeader>
              <DialogTitle>Заявка #{request.id}</DialogTitle>
              <DialogDescription>
                {request.email} · {statusLabels[request.status]} · запрошено {formatMoney(request.requested_amount)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-md border border-border bg-surface p-4 text-sm leading-6 text-muted">
                <p>Создана: {formatDate(request.created_at)}</p>
                {request.user_comment ? <p className="mt-1">Комментарий пользователя: {request.user_comment}</p> : null}
                {request.invoice_sent_at ? <p className="mt-1">Счёт отправлен: {formatDate(request.invoice_sent_at)}</p> : null}
                {request.paid_at ? <p className="mt-1">Оплата отмечена: {formatDate(request.paid_at)}</p> : null}
                {request.completed_at ? <p className="mt-1">Завершена: {formatDate(request.completed_at)}</p> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={invoiceAmount}
                  onChange={(event) => setInvoiceAmount(event.target.value)}
                  inputMode="numeric"
                  placeholder={`Сумма счёта, ₽ (${request.invoice_amount ?? request.requested_amount})`}
                />
                <Input
                  value={adminComment}
                  onChange={(event) => setAdminComment(event.target.value)}
                  placeholder={request.admin_comment ?? "Комментарий администратора"}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <Button type="button" variant="secondary" disabled={isPending || request.status !== "pending"} onClick={() => submit("start_processing")}>
                  Взять в работу
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending || (request.status !== "processing" && request.status !== "invoice_sent")}
                  onClick={() => submit("send_invoice")}
                >
                  Счёт отправлен
                </Button>
                <Button type="button" variant="secondary" disabled={isPending || request.status !== "invoice_sent"} onClick={() => submit("mark_paid")}>
                  Отметить оплачено
                </Button>
                <Button type="button" disabled={isPending || request.status !== "paid"} onClick={() => submit("confirm_payment")}>
                  Зачислить на баланс
                </Button>
              </div>

              {message ? <p className="rounded-md border border-border bg-surface p-3 text-sm text-muted">{message}</p> : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function applyTopupAction(
  request: AdminTopupRequest,
  action: TopupAction,
  invoiceAmount: string,
  adminComment: string,
  adminEmail: string,
): AdminTopupRequest {
  const now = new Date().toISOString();
  const parsedInvoiceAmount = Number(invoiceAmount || request.invoice_amount || request.requested_amount);

  if (action === "start_processing") {
    return {
      ...request,
      status: "processing",
      processed_by_email: adminEmail,
      updated_at: now,
    };
  }

  if (action === "send_invoice") {
    return {
      ...request,
      status: "invoice_sent",
      invoice_amount: Number.isFinite(parsedInvoiceAmount) && parsedInvoiceAmount > 0 ? parsedInvoiceAmount : request.requested_amount,
      admin_comment: adminComment || request.admin_comment,
      processed_by_email: adminEmail,
      invoice_sent_at: request.invoice_sent_at ?? now,
      updated_at: now,
    };
  }

  if (action === "mark_paid") {
    return {
      ...request,
      status: "paid",
      admin_comment: adminComment || request.admin_comment,
      processed_by_email: adminEmail,
      paid_at: request.paid_at ?? now,
      updated_at: now,
    };
  }

  return {
    ...request,
    status: "completed",
    processed_by_email: adminEmail,
    paid_at: request.paid_at ?? now,
    completed_at: request.completed_at ?? now,
    updated_at: now,
  };
}

function SortButton({
  active,
  direction,
  children,
  onClick,
}: {
  active: boolean;
  direction: SortDirection;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-surface hover:text-white"
    >
      {children}
      <ArrowDownUp className={active ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted"} />
      <span className="sr-only">{active ? `Сортировка ${direction}` : "Включить сортировку"}</span>
    </button>
  );
}

function PaginationControls({
  currentPage,
  pageCount,
  total,
  onPrev,
  onNext,
}: {
  currentPage: number;
  pageCount: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted">
        Найдено: {total}. Страница {currentPage} из {pageCount}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={currentPage <= 1} onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" />
          Назад
        </Button>
        <Button type="button" variant="secondary" disabled={currentPage >= pageCount} onClick={onNext}>
          Вперёд
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function QuickBalanceControl({ userId }: { userId: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(operation: "credit" | "debit") {
    const formData = new FormData();
    formData.set("userId", String(userId));
    formData.set("operation", operation);
    formData.set("amount", amount);
    formData.set("reason", operation === "credit" ? "Быстрое пополнение из админки" : "Быстрое списание из админки");

    startTransition(async () => {
      const result = await adminAdjustBalanceAction(formData);
      if (result.ok) {
        setAmount("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-w-72 flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="numeric"
        placeholder="Сумма"
        className="sm:w-28"
        aria-label="Сумма изменения баланса"
      />
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button type="button" size="icon" disabled={isPending || !amount} aria-label="Пополнить баланс" onClick={() => submit("credit")}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          disabled={isPending || !amount}
          aria-label="Списать баланс"
          onClick={() => submit("debit")}
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function UserDialog({
  user,
  orders,
  transactions,
  topupRequests,
  serviceInvoiceRequests,
  currentAdminId,
  onOpenChange,
}: {
  user: AdminUser | null;
  orders: AdminOrder[];
  transactions: AdminTransaction[];
  topupRequests: AdminTopupRequest[];
  serviceInvoiceRequests: AdminServiceInvoiceRequest[];
  currentAdminId: number;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        {user ? (
          <>
            <DialogHeader>
              <DialogTitle>{user.email}</DialogTitle>
              <DialogDescription>
                Текущий баланс: {formatMoney(user.balance)} · Зарегистрирован: {formatDate(user.created_at)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-4">
                <BalanceControls userId={user.id} />
                {user.id !== currentAdminId ? <DeleteUserControl userId={user.id} email={user.email} /> : null}
              </div>

              <div className="space-y-4">
                <HistorySection title="История заказов" empty="Заказов пока нет.">
                  {orders.map((order) => (
                    <HistoryItem
                      key={order.id}
                      title={`#${order.id} · ${order.service_title}`}
                      meta={`${formatDate(order.created_at)} · ${order.status} · ${order.payment_method}`}
                      value={formatMoney(order.amount)}
                    />
                  ))}
                </HistorySection>

                <HistorySection title="История пополнений" empty="Пополнений пока нет.">
                  {serviceInvoiceRequests.map((request) => (
                    <HistoryItem
                      key={`invoice-${request.id}`}
                      title={`Заявка #${request.id} · заказ #${request.order_id}`}
                      meta={`${request.service_title} · ${formatDate(request.created_at)} · ${statusLabels[request.status]}`}
                      value={formatMoney(request.invoice_amount ?? request.requested_amount)}
                    />
                  ))}
                  {topupRequests.map((request) => (
                    <HistoryItem
                      key={request.id}
                      title={`Заявка #${request.id} · ${statusLabels[request.status]}`}
                      meta={`${formatDate(request.created_at)}${request.admin_comment ? ` · ${request.admin_comment}` : ""}`}
                      value={formatMoney(request.invoice_amount ?? request.requested_amount)}
                    />
                  ))}
                  {transactions
                    .filter((transaction) => transaction.amount > 0)
                    .map((transaction) => (
                      <HistoryItem
                        key={`tx-${transaction.id}`}
                        title={transaction.description}
                        meta={`${formatDate(transaction.created_at)} · ${transaction.type}`}
                        value={`+${formatMoney(transaction.amount)}`}
                      />
                    ))}
                </HistorySection>

                <HistorySection title="Все транзакции" empty="Транзакций пока нет.">
                  {transactions.map((transaction) => (
                    <HistoryItem
                      key={transaction.id}
                      title={transaction.description}
                      meta={`${formatDate(transaction.created_at)} · ${transaction.type}`}
                      value={`${transaction.amount > 0 ? "+" : ""}${formatMoney(transaction.amount)}`}
                      danger={transaction.amount < 0}
                    />
                  ))}
                </HistorySection>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BalanceControls({ userId }: { userId: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(operation: "credit" | "debit") {
    const formData = new FormData();
    formData.set("userId", String(userId));
    formData.set("operation", operation);
    formData.set("amount", amount);
    formData.set("reason", reason);

    startTransition(async () => {
      const result = await adminAdjustBalanceAction(formData);
      setMessage(result.message);
      if (result.ok) {
        setAmount("");
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <WalletCards className="h-5 w-5 text-primary" />
        <h3 className="font-display text-xl font-semibold text-white">Управление балансом</h3>
      </div>
      <div className="mt-4 grid gap-3">
        <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" placeholder="Сумма, ₽" />
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Комментарий для транзакции" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" disabled={isPending} onClick={() => submit("credit")}>
            Пополнить
          </Button>
          <Button type="button" variant="secondary" disabled={isPending} onClick={() => submit("debit")}>
            Списать
          </Button>
        </div>
        {message ? <p className="text-sm leading-6 text-muted">{message}</p> : null}
      </div>
    </div>
  );
}

function DeleteUserControl({ userId, email }: { userId: number; email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-display text-xl font-semibold text-white">Удаление пользователя</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          Аккаунт {email} можно удалить вместе с заказами, транзакциями и заявками.
        </p>
        <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" />
          Удалить пользователя
        </Button>
      </div>
      <DeleteConfirmDialog user={{ id: userId, email } as AdminUser} onOpenChange={(nextOpen) => setOpen(nextOpen)} open={open} />
    </>
  );
}

function DeleteConfirmDialog({
  user,
  open,
  onOpenChange,
}: {
  user: Pick<AdminUser, "id" | "email"> | null;
  open?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const dialogOpen = open ?? Boolean(user);

  function submit() {
    if (!user) return;

    const formData = new FormData();
    formData.set("userId", String(user.id));
    formData.set("confirmation", confirmation);

    startTransition(async () => {
      const result = await deleteUserAction(formData);
      setMessage(result.message);
      if (result.ok) {
        setConfirmation("");
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setConfirmation("");
          setMessage("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить пользователя?</DialogTitle>
          <DialogDescription>
            Для удаления аккаунта {user?.email} введите DELETE. Действие удалит связанные заказы, транзакции и заявки.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Введите DELETE" />
          <Button type="button" variant="outline" disabled={isPending || confirmation !== "DELETE"} onClick={submit}>
            <Trash2 className="h-4 w-4" />
            Подтвердить удаление
          </Button>
          {message ? <p className="text-sm leading-6 text-muted">{message}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistorySection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Children.toArray(children);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length ? items : <p className="rounded-md border border-border bg-card p-3 text-sm text-muted">{empty}</p>}
      </div>
    </section>
  );
}

function HistoryItem({
  title,
  meta,
  value,
  danger,
}: {
  title: string;
  meta: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-start">
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{meta}</p>
      </div>
      <p className={danger ? "shrink-0 font-display text-lg font-semibold text-primary" : "shrink-0 font-display text-lg font-semibold text-white"}>
        {value}
      </p>
    </div>
  );
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function writeWorkbook(
  XLSX: typeof import("xlsx"),
  rows: Record<string, string | number>[],
  fileName: string,
  sheetName: string,
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}
