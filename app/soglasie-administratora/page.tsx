import type { Metadata } from "next";
import Link from "next/link";
import { PageTransition } from "@/components/page-transition";
import { privacyConsentVersion, privacyPolicyPath } from "@/lib/privacy-policy";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Согласие администратора на обработку персональных данных | СКМ",
  robots: { index: false, follow: false },
};

export default function AdminConsentPage() {
  return (
    <PageTransition>
      <main className="section-shell py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">Согласие на обработку персональных данных для входа администратора</h1>
          <div className="mt-8 space-y-5 text-base leading-8 text-muted">
            <p>Свободно, своей волей и в своём интересе я даю {siteConfig.companyName} ({siteConfig.legalName}, ИНН {siteConfig.inn}, ОГРН {siteConfig.ogrn}, адрес: {siteConfig.legalAddress}) согласие на обработку данных для проверки полномочий, доставки кода входа и безопасного доступа к управлению service-skm.ru.</p>
            <p>Данные: указанный мной email, идентификатор и роль учётной записи, сведения о запросе и проверке кода, хеш кода, срок его действия, сведения о сессии и подтверждении этого согласия. Действия: сбор, запись, систематизация, хранение, уточнение, использование, предоставление, блокирование и уничтожение. Способ — автоматизированный.</p>
            <p>Для хостинга и основной базы используется Timeweb Cloud в Москве, Россия. Для доставки служебного письма адрес получателя и письмо с кодом передаются сервису Resend (Plus Five Five, Inc.), который хранит данные в США. Я ознакомлен с этим получателем и расположением данных. Это согласие не отменяет обязанностей оператора по локализации и уведомлению Роскомнадзора о трансграничной передаче.</p>
            <p>Согласие действует до прекращения моих полномочий администратора или отзыва. Отзыв направляется на {siteConfig.email} или почтой по адресу оператора. После отзыва данные уничтожаются в сроки закона № 152-ФЗ, если нет иного законного основания обработки.</p>
            <p>Согласие подтверждается самостоятельной отметкой отдельного флажка и запросом кода входа. Согласие на рекламу, рассылки и публикацию моих данных этим действием не даётся.</p>
            <p>Подробные правила обработки: <Link href={privacyPolicyPath} className="text-primary underline underline-offset-4">Политика обработки персональных данных</Link>.</p>
            <p className="text-sm">Версия согласия: {privacyConsentVersion}.</p>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
