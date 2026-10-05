"use client";

import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { siteConfig } from "@/lib/site-config";

type ContactDialogProps = {
  children: ReactNode;
  serviceTitle?: string;
};

export function ContactDialog({ children, serviceTitle }: ContactDialogProps) {
  const emailHref = serviceTitle
    ? `${siteConfig.emailHref}?subject=${encodeURIComponent(`Вопрос по услуге: ${serviceTitle}`)}`
    : siteConfig.emailHref;

  const optionClass = "focus-ring flex min-h-14 items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left text-white transition-colors hover:border-primary/60 hover:bg-primary/10";

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Как связаться с СКМ</DialogTitle>
          <DialogDescription>
            {serviceTitle ? `Обсудим услугу «${serviceTitle}» и рассчитаем итоговую стоимость.` : "Выберите удобный способ связи. Расскажите о задаче, и мы уточним детали."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <a href={emailHref} className={optionClass}>
            <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span><span className="block font-semibold">Написать на почту</span><span className="block text-sm text-muted">{siteConfig.email}</span></span>
          </a>
          <a href={siteConfig.phoneHref} className={optionClass}>
            <Phone className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span><span className="block font-semibold">Позвонить</span><span className="block text-sm text-muted">{siteConfig.phone}</span></span>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
