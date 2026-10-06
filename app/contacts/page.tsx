import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-static";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Контакты и реквизиты ООО «СКМ»",
  description: "Телефон, электронная почта, адрес и реквизиты ООО «Сервис Компрессорных Машин». Вентиляция и холодоснабжение в Москве и Московской области.",
  alternates: { canonical: "/contacts" },
};

const details = [
  ["Полное наименование", siteConfig.legalName],
  ["Сокращённое наименование", siteConfig.companyName],
  ["ИНН / КПП", `${siteConfig.inn} / ${siteConfig.kpp}`],
  ["ОГРН", siteConfig.ogrn],
  ["Юридический и почтовый адрес", siteConfig.legalAddress],
  ["Генеральный директор", `${siteConfig.director}, действует на основании Устава`],
  ["Получатель платежа", siteConfig.bankDetails.recipient],
  ["Расчётный счёт", siteConfig.bankDetails.account],
  ["Банк", siteConfig.bankDetails.bank],
  ["Корреспондентский счёт", siteConfig.bankDetails.correspondentAccount],
  ["БИК", siteConfig.bankDetails.bik],
];

export default function ContactsPage() {
  return (
    <PageTransition>
      <main className="section-shell py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <Badge>ООО «СКМ»</Badge>
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-5xl">Контакты и реквизиты</h1>
          <p className="mt-4 text-base leading-8 text-muted">Монтаж, ремонт и обслуживание вентиляции и холодоснабжения в Москве и Московской области. Позвоните или напишите — обсудим оборудование, объём работ и выезд на объект.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <a href={siteConfig.phoneHref} className="focus-ring flex min-h-24 items-center gap-4 rounded-lg border border-border bg-card p-5 hover:border-primary">
              <Phone className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <span><span className="block text-sm text-muted">Телефон</span><span className="mt-1 block text-lg font-semibold text-white">{siteConfig.phone}</span></span>
            </a>
            <a href={siteConfig.emailHref} className="focus-ring flex min-h-24 min-w-0 items-center gap-4 rounded-lg border border-border bg-card p-5 hover:border-primary">
              <Mail className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0"><span className="block text-sm text-muted">Электронная почта</span><span className="mt-1 block break-all text-lg font-semibold text-white">{siteConfig.email}</span></span>
            </a>
          </div>
          <p className="mt-5 text-sm leading-7 text-muted">Выездные работы — круглосуточно по предварительному согласованию. Время консультации и выезда уточняется при обращении. Юридический адрес указан для идентификации компании и корреспонденции; приём посетителей согласуется заранее.</p>
          <section className="mt-10 rounded-lg border border-border bg-card p-5 sm:p-7" aria-labelledby="company-details">
            <h2 id="company-details" className="font-display text-2xl font-semibold text-white">Реквизиты компании</h2>
            <dl className="mt-6 divide-y divide-border">
              {details.map(([label, value]) => (
                <div key={label} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
                  <dt className="text-sm leading-7 text-muted">{label}</dt>
                  <dd className="min-w-0 break-words text-sm leading-7 text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <p className="mt-6 text-sm leading-7 text-muted">Стоимость в каталоге ориентировочная. Состав работ, материалы, выезд, налоги и итоговая цена согласуются в смете и договоре. Оплату проводите после получения согласованного счёта компании.</p>
        </div>
      </main>
    </PageTransition>
  );
}
