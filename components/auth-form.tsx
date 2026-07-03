"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { KeyRound, Mail } from "lucide-react";
import { requestOtpAction, verifyOtpAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;

    const timer = window.setInterval(() => {
      setResendIn((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendIn]);

  function requestCode(formData: FormData) {
    startTransition(async () => {
      const result = await requestOtpAction(formData);
      setMessage(result.message);
      if (result.ok) {
        setCodeRequested(true);
        setResendIn(60);
        setCode(result.code ?? "");
      }
    });
  }

  function verifyCode(formData: FormData) {
    startTransition(async () => {
      const result = await verifyOtpAction(formData);
      setMessage(result.message);
      if (result.ok) router.push(search.get("next") ?? "/account");
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <form action={requestCode} className="space-y-4">
        <label className="block text-sm font-medium text-white" htmlFor="email">
          Email
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setCode("");
                setCodeRequested(false);
                setResendIn(0);
              }}
              placeholder="name@company.ru"
              className="pl-9"
            />
          </div>
          <Button disabled={isPending || resendIn > 0}>
            {isPending
              ? "Отправка..."
              : resendIn > 0
                ? `Повторно через ${resendIn} сек.`
                : codeRequested
                  ? "Отправить код повторно"
                  : "Получить код"}
          </Button>
        </div>
      </form>

      <form action={verifyCode} className="mt-6 space-y-4">
        <input type="hidden" name="email" value={email} />
        <label className="block text-sm font-medium text-white" htmlFor="code">
          Код подтверждения
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              required
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="pl-9 tracking-[0.35em]"
            />
          </div>
          <Button variant="secondary" disabled={isPending || !email || !codeRequested}>
            Войти
          </Button>
        </div>
      </form>

      {message ? (
        <p className="mt-5 rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted">{message}</p>
      ) : null}
    </div>
  );
}
