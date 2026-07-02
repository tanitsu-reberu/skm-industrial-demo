"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { requestBalanceTopupAction } from "@/lib/actions";
import { siteConfig } from "@/lib/site-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TopUpForm() {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await requestBalanceTopupAction(formData);
      setMessage(result.message);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="rounded-md border border-border bg-surface p-4 text-sm leading-6 text-muted">
        <p className="font-medium text-white">Реквизиты для пополнения</p>
        <p className="mt-2">{siteConfig.bankDetails.recipient}</p>
        <p>{siteConfig.bankDetails.bank}</p>
        <p>Назначение: {siteConfig.bankDetails.purpose}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Input name="amount" inputMode="numeric" placeholder="Сумма, ₽" defaultValue="50000" required />
        <Input name="comment" placeholder="Комментарий для менеджера" />
      </div>

      <Button disabled={isPending} className="w-full sm:w-auto">
        <Send className="h-4 w-4" />
        {isPending ? "Отправка..." : "Запросить пополнение баланса"}
      </Button>

      {message ? <p className="text-sm leading-6 text-muted">{message}</p> : null}
    </form>
  );
}
