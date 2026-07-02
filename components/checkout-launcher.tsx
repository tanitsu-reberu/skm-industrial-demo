"use client";

import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckoutPanel } from "@/components/checkout-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Service } from "@/lib/services";

export function CheckoutLauncher({ service }: { service: Service }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg" className="h-14 w-full sm:w-auto">
          <ShoppingCart className="h-5 w-5" />
          Заказать услугу
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Оформление заказа</DialogTitle>
          <DialogDescription>
            Выберите способ оплаты. Оплата с баланса создает заказ сразу, оплата картой отправляет заявку менеджеру.
          </DialogDescription>
        </DialogHeader>
        <CheckoutPanel service={service} />
      </DialogContent>
    </Dialog>
  );
}
