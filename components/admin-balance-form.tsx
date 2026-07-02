"use client";

import { useState, useTransition } from "react";
import { adminAdjustBalanceAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminBalanceForm({ userId }: { userId: number }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await adminAdjustBalanceAction(formData);
      setMessage(result.message);
    });
  }

  return (
    <form action={submit} className="flex w-full flex-col gap-2 lg:min-w-64">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-2 sm:grid-cols-[110px_1fr_auto]">
        <Input name="amount" placeholder="+10000 / -5000" />
        <Input name="reason" placeholder="Причина" />
        <Button size="sm" disabled={isPending}>
          Применить
        </Button>
      </div>
      {message ? <span className="text-xs text-muted">{message}</span> : null}
    </form>
  );
}
