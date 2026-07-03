"use client";

import { useState, useTransition } from "react";
import { Send, WalletCards } from "lucide-react";
import { requestBalanceTopupAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function TopUpForm() {
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await requestBalanceTopupAction(formData);
      setMessage(result.message);
      if (result.ok) setOpen(false);
    });
  }

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full sm:w-auto">
            <WalletCards className="h-4 w-4" />
            Запросить пополнение баланса
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заявка на пополнение</DialogTitle>
            <DialogDescription>
              Укажите сумму. Администратор возьмёт заявку в работу, подготовит счёт и после оплаты зачислит средства на баланс.
            </DialogDescription>
          </DialogHeader>

          <form action={submit} className="space-y-4">
            <Input name="amount" inputMode="numeric" placeholder="Сумма, ₽" required />
            <Input name="comment" placeholder="Комментарий для менеджера" />
            <Button disabled={isPending} className="w-full">
              <Send className="h-4 w-4" />
              {isPending ? "Отправка..." : "Создать заявку"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {message ? <p className="text-sm leading-6 text-muted">{message}</p> : null}
    </div>
  );
}
