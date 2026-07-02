# СКМ: сайт и MVP-кабинет

Next.js 15 App Router + TypeScript + Tailwind CSS + shadcn-style UI + Framer Motion + Lenis + SQLite.

## Запуск

```bash
npm install
npm run dev
npm run build
npm run lint
```

Локально сайт открывается на `http://127.0.0.1:3000`.

## Как задать admin email

Админка скрыта по адресу `/admin`. Ссылки на нее нет в обычной навигации.

В `.env.local` задайте один или несколько email:

```env
ADMIN_EMAILS=admin@skm.ru,owner@skm.ru
AUTH_SECRET=long-random-secret
```

Если переменные не заданы, dev-значение по умолчанию: `admin@skm.ru`.

Пользователь получает admin-доступ только если его текущий email совпадает с `ADMIN_EMAILS` или `ADMIN_EMAIL`. Даже если в старой SQLite-базе у пользователя осталась роль `admin`, effective role пересчитывается по email.

## Как заменить логотип

Header использует файл из `siteConfig.logoPath`.

По умолчанию:

```ts
// lib/site-config.ts
logoPath: "/logo.png"
```

Чтобы заменить логотип, положите новый файл в `public/logo.png`. Если хотите использовать SVG, положите `public/logo.svg` и обновите `logoPath` и `src` в `components/header.tsx`.

## Контакты

Телефон, email и Telegram вынесены в `lib/site-config.ts`:

```ts
phone: "+7 999 000-00-00"
email: "service@skm.example"
telegramUrl: "https://t.me/skm_support_bot"
```

## Как работает вход по OTP

Пользователь вводит email, сервер создает 6-значный код, хранит в SQLite только HMAC-хеш и срок действия. Код живет 10 минут.

В dev-режиме код показывается на экране и пишется в консоль сервера. В production код на экран не выводится.

## Как подключить реальную отправку email через Resend

Точка подключения уже вынесена в `lib/email.ts`.

1. Установите пакет:

```bash
npm install resend
```

2. Добавьте переменные:

```env
RESEND_API_KEY=re_...
OTP_FROM_EMAIL=SKM <no-reply@your-domain.ru>
```

3. В `sendOtpEmail` раскомментируйте Resend-код и отправляйте HTML/текст письма с кодом.

## Баланс и оплаты

- Пополнение баланса больше не начисляется мгновенно.
- Кнопка "Запросить пополнение баланса" создает запись в `balance_topup_requests`.
- Администратор вручную увеличивает или уменьшает баланс в `/admin`.
- Оплата с баланса списывает деньги и создает оплаченный заказ.
- Оплата картой создает заказ со статусом `awaiting_payment`; менеджер связывается с клиентом.

## Как добавить новую услугу

1. Добавьте изображение в `public/services/`.
2. Откройте `lib/services.ts`.
3. Добавьте объект в массив `services` с уникальными `id` и `slug`.
4. Используйте категорию из `serviceCategories`.

В `lib/services.ts` есть комментарий с требованиями к реальным фото: компрессорные, приточные установки, вентиляция, редукторы, гидравлические прессы, запчасти и рабочие узлы.
