"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { KeyRound, Mail } from "lucide-react";
import { requestOtpAction, verifyOtpAction } from "@/lib/actions";
import { PersonalDataConsent } from "@/components/personal-data-consent";
import { Button } from "@/components/ui/button";
import { InputWithIcon } from "@/components/ui/input-with-icon";

const OTP_COOLDOWN_SECONDS = 60;
const OTP_COOLDOWN_STORAGE_KEY = "skm_otp_cooldown_until";

function readStoredCooldownSeconds() {
  if (typeof window === "undefined") return 0;

  const storedUntil = window.sessionStorage.getItem(OTP_COOLDOWN_STORAGE_KEY);
  if (!storedUntil) return 0;

  const untilMs = Number(storedUntil);
  if (!Number.isFinite(untilMs)) {
    window.sessionStorage.removeItem(OTP_COOLDOWN_STORAGE_KEY);
    return 0;
  }

  const remaining = Math.ceil((untilMs - Date.now()) / 1000);
  if (remaining <= 0 || remaining > OTP_COOLDOWN_SECONDS) {
    window.sessionStorage.removeItem(OTP_COOLDOWN_STORAGE_KEY);
    return 0;
  }

  return remaining;
}

function storeCooldown(seconds: number) {
  if (typeof window === "undefined" || seconds <= 0) return;
  window.sessionStorage.setItem(OTP_COOLDOWN_STORAGE_KEY, String(Date.now() + seconds * 1000));
}

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
    setResendIn(readStoredCooldownSeconds());
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;

    const timer = window.setInterval(() => {
      setResendIn((value) => {
        const next = Math.max(0, value - 1);
        if (next === 0) {
          window.sessionStorage.removeItem(OTP_COOLDOWN_STORAGE_KEY);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendIn]);

  function startCooldown(seconds: number) {
    const normalized = Math.max(0, Math.min(seconds, OTP_COOLDOWN_SECONDS));
    if (normalized <= 0) return;
    setResendIn(normalized);
    storeCooldown(normalized);
  }

  function requestCode(formData: FormData) {
    startTransition(async () => {
      const result = await requestOtpAction(formData);
      setMessage(result.message);

      if (result.retryAfterSeconds) {
        startCooldown(result.retryAfterSeconds);
      }

      if (result.ok) {
        setCodeRequested(true);
        startCooldown(result.retryAfterSeconds ?? OTP_COOLDOWN_SECONDS);
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
            }}
            placeholder="name@company.ru"
            wrapperClassName="min-w-0 w-full flex-1"
          />
          <Button
            type="submit"
            className="w-full shrink-0 whitespace-nowrap md:w-auto"
            disabled={isPending || resendIn > 0 || !email}
          >
            {isPending
              ? "Отправка..."
              : resendIn > 0
                ? `Повторно через ${resendIn} сек.`
                : codeRequested
                  ? "Отправить код повторно"
                  : "Получить код"}
          </Button>
        </div>
        <PersonalDataConsent disabled={isPending} id="auth-privacy-consent" />
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
          <Button
            type="submit"
            className="w-full shrink-0 whitespace-nowrap md:w-auto"
            variant="secondary"
            disabled={isPending || !email || !codeRequested}
          >
            Войти
          </Button>
        </div>
      </form>

      {message ? (
        <p
          className={
            message.toLowerCase().includes("отправлен")
              ? "mt-5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-100"
              : "mt-5 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm leading-6 text-white"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}