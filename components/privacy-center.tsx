"use client";

import { useState, useTransition } from "react";
import { createPrivacyRequestAction } from "@/lib/privacy-actions";
import type { PrivacyRequest } from "@/lib/privacy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const labels = { access: "Доступ к данным", correction: "Исправление", deletion: "Удаление", withdrawal: "Отзыв согласия" };
const statuses = { new: "Получен", in_progress: "В работе", completed: "Исполнен", rejected: "Отклонён" };

export function PrivacyCenter({ requests }: { requests: PrivacyRequest[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createPrivacyRequestAction(formData);
      setMessage(result.message);
    });
  }

  return (
    <Card className="mt-5" id="privacy">
      <CardHeader><CardTitle>Персональные данные</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm leading-6 text-muted">Создайте запрос оператору. Статус и ответ появятся здесь. Удаление выполняется после проверки обязательных сроков хранения бухгалтерских и договорных документов.</p>
        <form action={submit} className="flex flex-col gap-3">
          <label htmlFor="privacy-request-type" className="text-sm font-medium text-white">Тип запроса</label>
          <select id="privacy-request-type" name="type" required className="focus-ring h-10 rounded-md border border-border bg-surface px-3 text-sm text-white">
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="privacy-request-details" className="text-sm font-medium text-white">Уточнение</label>
          <Input id="privacy-request-details" name="details" maxLength={1000} placeholder="Какие данные предоставить или исправить" />
          <Button disabled={pending} className="w-full sm:w-fit">{pending ? "Отправка..." : "Создать запрос"}</Button>
          {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
        </form>
        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-white">История запросов</h3>
          {requests.length ? requests.map((request) => (
            <article key={request.id} className="rounded-md border border-border bg-surface p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><strong className="text-white">{labels[request.type]}</strong><span className="text-primary">{statuses[request.status]}</span></div>
              {request.details ? <p className="mt-2 text-muted">{request.details}</p> : null}
              {request.admin_comment ? <p className="mt-2 text-muted">Ответ: {request.admin_comment}</p> : null}
            </article>
          )) : <p className="text-sm text-muted">Запросов пока нет.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
