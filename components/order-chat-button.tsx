"use client";

import { MessageCircle } from "lucide-react";
import { openSiteChatWithContext } from "@/lib/open-site-chat";

type OrderChatButtonProps = {
  orderId: number;
  title: string;
  amount: number;
};

export function OrderChatButton({ orderId, title, amount }: OrderChatButtonProps) {
  return (
    <button
      type="button"
      onClick={() =>
        openSiteChatWithContext({
          source: "account-order",
          action: `Обсудить заказ #${orderId}`,
          orderId,
          serviceTitle: title,
          amount,
        })
      }
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-primary/40 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      Обсудить заказ
    </button>
  );
}
