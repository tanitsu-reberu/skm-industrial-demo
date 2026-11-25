"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, Trash2 } from "lucide-react";
import { deleteContactRequestAction, updateContactRequestStatusAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputWithIcon } from "@/components/ui/input-with-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

type ContactRequestStatus = "new" | "in_progress" | "processed";

type AdminContactRequest = {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  consent_version: string | null;
  consented_at: string | null;
  comment: string;
  status: ContactRequestStatus;
  created_at: string;
  updated_at: string;
};

const contactStatusLabels: Record<ContactRequestStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  processed: "Обработана",
};

export function AdminDashboard({ contactRequests }: { contactRequests: AdminContactRequest[] }) {
  return <ContactRequestsPanel initialRequests={contactRequests} />;
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
        return [request.name, request.phone, request.email, request.comment, String(request.id)]
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
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
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
          wrapperClassName="w-full min-w-0 shrink-0 sm:w-[22rem] lg:w-[24rem]"
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
                  {request.email ? <p className="break-all text-sm text-muted">{request.email}</p> : null}
                  {request.consent_version ? <p className="text-xs text-muted">Согласие от {request.consent_version}</p> : null}
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
                  {request.email ? <p className="break-all text-sm text-muted">{request.email}</p> : null}
                  {request.consent_version ? <p className="text-xs text-muted">Согласие от {request.consent_version}</p> : null}
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
