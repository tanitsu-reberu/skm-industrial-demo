"use client";

import { useState, useTransition } from "react";
import { FileText } from "lucide-react";
import { CheckoutConsultationNotice } from "@/components/checkout-consultation-notice";
import { requestServiceInvoicePaymentAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import type { Service } from "@/lib/services";

export function CheckoutPanel({ service }: { service: Service }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function requestInvoicePayment() {
    startTransition(async () => {
      const result = await requestServiceInvoicePaymentAction(service.slug);
      setMessage(result.message);
    });
  }

  return (
    <div className="space-y-5">
      <CheckoutConsultationNotice />

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-sm text-muted">Выбранная услуга</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <p className="font-display text-xl font-semibold leading-tight text-white">{service.title}</p>
          <p className="shrink-0 font-display text-xl font-semibold text-white">от {formatMoney(service.price)}</p>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          Указанная сумма ориентировочная. Итоговая стоимость и счёт согласуются с менеджером в онлайн-чате.
        </p>
      </div>

      <Button
        onClick={requestInvoicePayment}
        disabled={isPending}
        className="h-auto min-h-14 w-full justify-start px-4 py-3 sm:justify-center"
      >
        <FileText className="h-5 w-5 shrink-0" />
        <span className="text-left sm:text-center">Оформить оплату по счёту</span>
      </Button>

      {message ? (
        <p className="rounded-md border border-border bg-surface p-4 text-base leading-7 text-muted sm:text-sm sm:leading-6">
          {message}
        </p>
      ) : null}
    </div>
  );
}