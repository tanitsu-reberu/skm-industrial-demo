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
            Оплата только по счёту. Сначала согласуйте детали заказа и итоговую стоимость в онлайн-чате на сайте.
          </DialogDescription>
        </DialogHeader>
        <CheckoutPanel service={service} />
      </DialogContent>
    </Dialog>
  );
}
