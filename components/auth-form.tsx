"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { verifyAuthenticatorAction } from "@/lib/actions";
import { PersonalDataConsent } from "@/components/personal-data-consent";
import { Button } from "@/components/ui/button";
import { InputWithIcon } from "@/components/ui/input-with-icon";

export function AuthenticatorForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function verify(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await verifyAuthenticatorAction(formData);
        setMessage(result.message);
        if (result.ok) router.replace("/admin");
      } catch {
        setMessage("Не удалось проверить код. Попробуйте ещё раз.");
      }
    });
  }

  return (
    <form action={verify} className="space-y-4 rounded-lg border border-border bg-card p-5 sm:p-6">
      <PersonalDataConsent disabled={isPending} id="authenticator-consent" />
      <label className="block text-sm font-medium text-white" htmlFor="authenticator-code">Код из приложения</label>
      <InputWithIcon
        icon={KeyRound}
        id="authenticator-code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
      />
      <Button type="submit" className="w-full" disabled={isPending}>{isPending ? "Проверяю…" : "Войти"}</Button>
      {message ? <p role="status" className="text-sm text-white">{message}</p> : null}
    </form>
  );
}
