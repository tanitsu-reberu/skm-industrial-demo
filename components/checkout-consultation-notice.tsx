"use client";

import { MessageCircle } from "lucide-react";
import { checkoutConsultationNotice } from "@/lib/checkout-messages";
import { Button } from "@/components/ui/button";

export function CheckoutConsultationNotice() {
  function openChat() {
    if (window.Tawk_API?.maximize) {
      window.Tawk_API.maximize();
      return;
    }

    window.Tawk_API?.toggle?.();
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-3">
          <p className="text-sm leading-6 text-white">{checkoutConsultationNotice}</p>
          <Button type="button" variant="secondary" size="sm" onClick={openChat}>
            Написать в чат
          </Button>
        </div>
      </div>
    </div>
  );
}