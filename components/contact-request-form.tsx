"use client";

import { useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createContactRequestAction } from "@/lib/actions";
import { PersonalDataConsent } from "@/components/personal-data-consent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ContactRequestForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage("");

    startTransition(async () => {
      const result = await createContactRequestAction(formData);
      setMessage(result.message);
      setIsSuccess(result.ok);

      if (result.ok) {
        formRef.current?.reset();
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="min-w-0 space-y-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Input name="name" placeholder="Имя" autoComplete="name" disabled={isPending} />
        <Input name="phone" placeholder="Телефон *" autoComplete="tel" inputMode="tel" required disabled={isPending} />
      </div>
      <textarea
        name="comment"
        required
        rows={5}
        minLength={5}
        maxLength={1200}
        disabled={isPending}
        placeholder="Что необходимо сделать: объект, тип системы, проблема или задача"
        className="focus-ring min-h-36 w-full rounded-md border border-border bg-surface px-4 py-3 text-base text-white placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50"
      />
      <PersonalDataConsent disabled={isPending} id="contact-privacy-consent" />
      <Button disabled={isPending} className="w-full sm:w-auto">
        <Send className="h-4 w-4" />
        {isPending ? "Отправка..." : "Оставить заявку"}
      </Button>
      {message ? (
        <p
          className={
            isSuccess
              ? "rounded-md border border-primary/50 bg-primary/10 p-3 text-sm leading-6 text-white"
              : "rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted"
          }
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
