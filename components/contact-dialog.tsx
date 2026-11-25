"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createContactRequestAction, type ActionResult } from "@/lib/actions";
import { contactConsentPath, contactConsentVersion, contactRequestsEnabled, privacyConsentField } from "@/lib/privacy-policy";
import { siteConfig } from "@/lib/site-config";

type ContactDialogProps = {
  children: ReactNode;
  serviceTitle?: string;
};

function ContactRequestForm({ serviceTitle }: Pick<ContactDialogProps, "serviceTitle">) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const consentId = `${id}-consent`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !contactRequestsEnabled) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setResult(null);

    startTransition(async () => {
      try {
        const response = await createContactRequestAction(data);
        setResult(response);
        if (response.ok) form.reset();
      } catch {
        setResult({ ok: false, message: "Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <input type="hidden" name="consentVersion" value={contactConsentVersion} />
      <fieldset disabled={pending || !contactRequestsEnabled} className="grid min-w-0 gap-4">
        <label className="grid gap-1.5 text-sm font-medium text-white">
          ФИО
          <Input name="name" autoComplete="name" maxLength={120} />
        </label>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-white">
            Телефон
            <Input name="phone" type="tel" autoComplete="tel" required maxLength={32} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-white">
            Электронная почта
            <Input name="email" type="email" autoComplete="email" maxLength={254} />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-white">
          Сообщение
          <textarea
            name="comment"
            rows={3}
            maxLength={1200}
            defaultValue={serviceTitle ? `Вопрос по услуге «${serviceTitle}»` : undefined}
            className="focus-ring w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base text-white"
          />
        </label>
      </fieldset>
      <div className="flex items-start gap-3 rounded-md border border-border bg-surface/60 p-3">
        <input
          id={consentId}
          name={privacyConsentField}
          type="checkbox"
          required
          disabled={pending}
          aria-labelledby={`${id}-consent-text`}
          className="focus-ring mt-1 size-5 shrink-0 cursor-pointer accent-primary"
        />
        <div id={`${id}-consent-text`} className="text-sm leading-6 text-muted">
          <label className="cursor-pointer" htmlFor={consentId}>
            При передаче своих персональных данных Оператору через данную форму, я даю свое{" "}
          </label>
          <a
            href={contactConsentPath}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring font-medium text-red-400 underline underline-offset-2"
          >
            согласие
          </a>
          <label className="cursor-pointer" htmlFor={consentId}>
            {" "}Оператору на их обработку
          </label>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={pending || !contactRequestsEnabled}>
        {pending ? "Отправляем…" : "Даю свое согласие на обработку персональных данных"}
      </Button>
      {!contactRequestsEnabled ? <p className="text-sm text-muted">Приём заявок через сайт пока закрыт.</p> : null}
      {result ? (
        <p role={result.ok ? "status" : "alert"} className="text-sm leading-6 text-white">{result.message}</p>
      ) : null}
    </form>
  );
}

export function ContactDialog({ children, serviceTitle }: ContactDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Связаться с СКМ</DialogTitle>
          <DialogDescription>Оставьте заявку или свяжитесь с нами напрямую.</DialogDescription>
        </DialogHeader>
        <ContactRequestForm serviceTitle={serviceTitle} />
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted">
          <a className="focus-ring min-h-11 content-center underline underline-offset-4" href={siteConfig.phoneHref}>Позвонить</a>
          <a className="focus-ring min-h-11 content-center underline underline-offset-4" href={siteConfig.emailHref}>Написать на почту</a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
