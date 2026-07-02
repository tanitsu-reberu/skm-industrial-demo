"use client";

import { useState, useTransition } from "react";
import { CreditCard, WalletCards } from "lucide-react";
import { checkoutByCardAction, checkoutFromBalanceAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import type { Service } from "@/lib/services";

export function CheckoutPanel({ service }: { service: Service }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function payWithBalance() {
    startTransition(async () => {
      const result = await checkoutFromBalanceAction(service.slug);
      setMessage(result.message);
    });
  }

  function payByCard() {
    startTransition(async () => {
      const result = await checkoutByCardAction(service.slug);
      setMessage(result.message);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-sm text-muted">Выбранная услуга</p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <p className="font-display text-xl font-semibold text-white">{service.title}</p>
          <p className="shrink-0 font-display text-xl font-semibold text-white">{formatMoney(service.price)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button onClick={payWithBalance} disabled={isPending} className="h-14">
          <WalletCards className="h-5 w-5" />
          Оплатить с баланса
        </Button>
        <Button onClick={payByCard} disabled={isPending} variant="secondary" className="h-14">
          <CreditCard className="h-5 w-5" />
          Оплатить картой
        </Button>
      </div>

      {message ? (
        <p className="rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted">{message}</p>
      ) : null}
    </div>
  );
}
