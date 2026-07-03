"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import {
  setupAdminPanelPasswordAction,
  verifyAdminPanelPasswordAction,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type AdminPanelAccessProps = {
  hasPassword: boolean;
  hasAccess: boolean;
  variant?: "button" | "banner" | "menu";
};

export function AdminPanelAccess({ hasPassword, hasAccess, variant = "button" }: AdminPanelAccessProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSuccess() {
    setOpen(false);
    router.push("/admin");
    router.refresh();
  }

  function setupPassword(formData: FormData) {
    startTransition(async () => {
      const result = await setupAdminPanelPasswordAction(formData);
      setMessage(result.message);
      if (result.ok) handleSuccess();
    });
  }

  function verifyPassword(formData: FormData) {
    startTransition(async () => {
      const result = await verifyAdminPanelPasswordAction(formData);
      setMessage(result.message);
      if (result.ok) handleSuccess();
    });
  }

  if (hasAccess) {
    if (variant === "menu") {
      return (
        <Button asChild variant="secondary" size="sm" className="w-full justify-start">
          <a href="/admin">
            <ShieldCheck className="h-4 w-4" />
            Админ-панель
          </a>
        </Button>
      );
    }

    return (
      <Button asChild>
        <a href="/admin">
          {variant === "banner" ? <ShieldCheck className="h-4 w-4" /> : null}
          Админ-панель
        </a>
      </Button>
    );
  }

  const trigger =
    variant === "banner" ? (
      <button
        type="button"
        className="focus-ring flex w-full items-center justify-between gap-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-4 text-left transition-colors hover:border-primary/70"
      >
        <div>
          <p className="font-display text-lg font-semibold text-white">Админ-панель</p>
          <p className="mt-1 text-sm text-muted">
            {hasPassword ? "Введите пароль для доступа к управлению" : "Установите индивидуальный пароль для входа"}
          </p>
        </div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
      </button>
    ) : variant === "menu" ? (
      <Button variant="secondary" size="sm" className="w-full justify-start">
        <ShieldCheck className="h-4 w-4" />
        Админ-панель
      </Button>
    ) : (
      <Button>
        <ShieldCheck className="h-4 w-4" />
        Админ-панель
      </Button>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setMessage("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <DialogTitle>{hasPassword ? "Вход в админ-панель" : "Установка пароля админ-панели"}</DialogTitle>
          <DialogDescription>
            {hasPassword
              ? "Введите ваш индивидуальный пароль. После успешной проверки доступ сохранится на 24 часа."
              : "Придумайте пароль для защиты админ-панели. Он хранится в базе только в зашифрованном виде."}
          </DialogDescription>
        </DialogHeader>

        {hasPassword ? (
          <form action={verifyPassword} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="admin-panel-password">
                Пароль админ-панели
              </label>
              <Input
                id="admin-panel-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Введите пароль"
              />
            </div>
            <Button className="w-full" disabled={isPending}>
              {isPending ? "Проверка..." : "Открыть админ-панель"}
            </Button>
          </form>
        ) : (
          <form action={setupPassword} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="admin-panel-password-new">
                Новый пароль
              </label>
              <Input
                id="admin-panel-password-new"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Минимум 8 символов"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="admin-panel-password-confirm">
                Повторите пароль
              </label>
              <Input
                id="admin-panel-password-confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Повторите пароль"
              />
            </div>
            <Button className="w-full" disabled={isPending}>
              {isPending ? "Сохранение..." : "Сохранить и войти"}
            </Button>
          </form>
        )}

        {message ? (
          <p className="rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted">{message}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}