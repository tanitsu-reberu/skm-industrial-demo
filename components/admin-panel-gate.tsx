"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LockKeyhole } from "lucide-react";
import {
  setupAdminPanelPasswordAction,
  verifyAdminPanelPasswordAction,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminPanelGate({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSuccess() {
    router.refresh();
  }

  function setupPassword(formData: FormData) {
    startTransition(async () => {
      const result = await setupAdminPanelPasswordAction(formData);
      setMessage(result.message);
      if (result.ok) onSuccess();
    });
  }

  function verifyPassword(formData: FormData) {
    startTransition(async () => {
      const result = await verifyAdminPanelPasswordAction(formData);
      setMessage(result.message);
      if (result.ok) onSuccess();
    });
  }

  return (
    <main className="section-shell grid min-h-[calc(100vh-5rem)] place-items-center py-12">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-center font-display text-3xl font-semibold text-white">
          {hasPassword ? "Дополнительная защита" : "Настройка доступа"}
        </h1>
        <p className="mt-3 text-center text-base leading-7 text-muted">
          {hasPassword
            ? "Для входа в админ-панель введите ваш индивидуальный пароль. Доступ сохранится на 24 часа."
            : "Установите индивидуальный пароль админ-панели. Он будет храниться в базе только в зашифрованном виде."}
        </p>

        {hasPassword ? (
          <form action={verifyPassword} className="mt-8 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="admin-gate-password">
                Пароль админ-панели
              </label>
              <Input
                id="admin-gate-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Введите пароль"
              />
            </div>
            <Button className="w-full" disabled={isPending}>
              {isPending ? "Проверка..." : "Войти в админ-панель"}
            </Button>
          </form>
        ) : (
          <form action={setupPassword} className="mt-8 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="admin-gate-password-new">
                Новый пароль
              </label>
              <Input
                id="admin-gate-password-new"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Минимум 8 символов"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="admin-gate-password-confirm">
                Повторите пароль
              </label>
              <Input
                id="admin-gate-password-confirm"
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
          <p className="mt-5 rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted">{message}</p>
        ) : null}
      </div>
    </main>
  );
}