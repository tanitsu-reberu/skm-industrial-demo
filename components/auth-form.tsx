"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { KeyRound, Mail } from "lucide-react";
import { requestOtpAction, verifyOtpAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { InputWithIcon } from "@/components/ui/input-with-icon";

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
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-stretch">
          <InputWithIcon
            icon={Mail}
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
            wrapperClassName="min-w-0 w-full flex-1"
          />
          <Button className="w-full shrink-0 whitespace-nowrap md:w-auto" disabled={isPending || resendIn > 0}>
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
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-stretch">
          <InputWithIcon
            icon={KeyRound}
            id="code"
            name="code"
            inputMode="numeric"
            required
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="tracking-[0.35em]"
            wrapperClassName="min-w-0 w-full flex-1"
          />
          <Button className="w-full shrink-0 whitespace-nowrap md:w-auto" variant="secondary" disabled={isPending || !email || !codeRequested}>
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
