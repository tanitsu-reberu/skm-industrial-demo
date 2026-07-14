import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Согласие на обработку персональных данных | СКМ",
  description: "Согласие пользователя на обработку персональных данных ООО «СКМ».",
};

const operator = [
  "ООО «Сервис Компрессорных Машин» (ООО «СКМ»)",
  "ИНН 9717171905 · ОГРН 1247700722840",
  "129164, г. Москва, Ракетный бульвар, д. 16",
  "i@ooo-skmoscow.ru · +7 977 585-19-69",
];

export default function ConsentPage() {
  return (
    <main className="section-shell py-10 sm:py-14">
      <article className="mx-auto max-w-4xl rounded-lg border border-border bg-card p-5 sm:p-8">
        <p className="text-sm text-primary">Редакция от 15 июля 2026 года</p>
        <h1 className="mt-3 text-balance font-display text-3xl font-semibold text-white sm:text-4xl">Согласие на обработку персональных данных</h1>
        <div className="mt-6 flex flex-col gap-3 rounded-md border border-border bg-surface p-4 text-sm leading-6 text-muted">
          {operator.map((line) => <p key={line}>{line}</p>)}
        </div>
        <div className="mt-8 flex flex-col gap-6 text-sm leading-7 text-muted">
          <section><h2 className="font-display text-xl font-semibold text-white">1. Предмет согласия</h2><p className="mt-2">Отправляя форму на сайте, я свободно, своей волей и в своём интересе даю оператору согласие на обработку указанных мной данных: имени, телефона, адреса электронной почты, комментария к заявке, сведений о заказах и обращениях.</p></section>
          <section><h2 className="font-display text-xl font-semibold text-white">2. Цели</h2><p className="mt-2">Обработка заявки, регистрация и работа личного кабинета, подготовка, заключение и исполнение договора, выставление счетов, сервисные уведомления и ответы на обращения.</p></section>
          <section><h2 className="font-display text-xl font-semibold text-white">3. Действия с данными</h2><p className="mt-2">Сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, передача уполномоченным обработчикам, блокирование, удаление и уничтожение автоматизированным и неавтоматизированным способом.</p></section>
          <section><h2 className="font-display text-xl font-semibold text-white">4. Срок и отзыв</h2><p className="mt-2">Согласие действует до достижения целей обработки или его отзыва, если иной срок не установлен законом. Отозвать согласие можно через раздел «Персональные данные» личного кабинета или письмом на i@ooo-skmoscow.ru. Отзыв не влияет на законность обработки до его получения.</p></section>
          <section><h2 className="font-display text-xl font-semibold text-white">5. Отдельное согласие на рекламу</h2><p className="mt-2">Получение рекламных и информационных предложений является добровольным и оформляется отдельным чекбоксом. Отказ не ограничивает получение услуги и сервисных сообщений.</p></section>
        </div>
        <p className="mt-8 text-sm text-muted">Подробнее: <Link href="/politika" className="text-primary underline underline-offset-4">Политика обработки персональных данных</Link>.</p>
      </article>
    </main>
  );
}
