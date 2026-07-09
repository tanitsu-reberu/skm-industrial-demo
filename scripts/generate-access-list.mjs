import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  PageBreak,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { getAdminGuideSections } from "./admin-guide-sections.mjs";
import { blank, bullet, h1, h2, infoTable, numbered, numberingConfig, p, paragraphStyles, spacer } from "./docx-shared.mjs";

import { agreementsOutputPaths } from "./docx-output-paths.mjs";

const outputPaths = agreementsOutputPaths("Список_доступов_для_передачи.docx");

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles,
  },
  numbering: { config: numberingConfig },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun("ООО СКМ — передача сайта service-skm.ru | Стр. "),
                new TextRun({ children: [PageNumber.CURRENT] }),
              ],
            }),
          ],
        }),
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: "Список доступов для передачи", bold: true, size: 36, color: "0B1F3A" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: "Веб-сайт service-skm.ru — ООО СКМ", size: 26 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: "В документе: доступы + инструкция администратора", italics: true, size: 22, color: "5C6F87" })],
        }),
        p("Дата: 04.07.2026"),
        p("Модель оплаты на сайте: только по счёту. Согласование заказов — в онлайн-чате Tawk.to."),

        new Paragraph({
          spacing: { before: 120, after: 240 },
          children: [new TextRun({ text: "Часть 1. Доступы и передача", bold: true, size: 34, color: "0B1F3A" })],
        }),

        h1("1. Что передаётся заказчику"),
        bullet("bullets", "Рабочий сайт на домене service-skm.ru"),
        bullet("bullets", "Личный кабинет клиента и админ-панель"),
        bullet("bullets", "Система заказов и оплаты по счёту"),
        bullet("bullets", "Онлайн-чат Tawk.to на сайте"),
        bullet("bullets", "Доступы к сервисам (по согласованию — см. ниже)"),
        bullet("bullets", "Настоящий документ с инструкцией администратора (часть 2)"),

        h1("2. Доступы к сайту"),
        p("На сайте нет обычного логина и пароля. Вход администратора — в два шага: OTP-код на email, затем пароль админ-панели."),
        h2("2.1. Административный доступ"),
        infoTable([
          ["Сайт", "https://service-skm.ru"],
          ["Админ-панель", "https://service-skm.ru/admin"],
          ["Вход", "https://service-skm.ru/login"],
          ["Личный кабинет клиента", "https://service-skm.ru/account"],
          ["Административные email", "fateewkostik@hotmail.com\nskm.moskow.www@gmail.com\ni@skmoscow.ru"],
          ["Вход на сайт", "6-значный OTP-код на email"],
          ["Пароль админ-панели", "Задаётся каждым админом при первом входе в /admin"],
        ]),
        spacer(),

        h2("2.2. Порядок входа в админку"),
        numbered("steps", "Откройте https://service-skm.ru/login"),
        numbered("steps", "Введите одну из административных почт"),
        numbered("steps", "Получите OTP на email и введите код"),
        numbered("steps", "Откройте https://service-skm.ru/admin"),
        numbered("steps", "При первом входе задайте пароль админ-панели (от 8 символов)"),
        numbered("steps", "При следующих входах вводите этот пароль"),
        p("Пароль админки хранится в зашифрованном виде. Посмотреть его нельзя — только сбросить и задать новый.", { italics: true }),
        p("Сессия админки — 24 часа на устройстве. Сессия на сайте — 7 дней."),

        h1("3. Инфраструктура"),
        h2("3.1. Домен и хостинг"),
        infoTable([
          ["Домен", "service-skm.ru"],
          ["WWW", "www.service-skm.ru → редирект на основной домен"],
          ["Хостинг", "Vercel — https://vercel.com"],
          ["Проект Vercel", "skm-industrial-demo"],
          ["Репозиторий", "https://github.com/tanitsu-reberu/skm-industrial-demo"],
        ]),
        spacer(),
        blank("Логин Vercel (если передаётся)"),
        blank("Пароль / токен Vercel (если передаётся)"),
        blank("Логин у регистратора домена"),
        blank("Пароль у регистратора домена"),

        h2("3.2. Онлайн-чат Tawk.to"),
        infoTable([
          ["Кабинет", "https://dashboard.tawk.to"],
          ["Property ID", "6a4835babb890f1d47e70e94"],
          ["Widget ID", "default"],
          ["Назначение", "Согласование заказов и суммы с клиентом до выставления счёта"],
        ]),
        spacer(),
        blank("Логин Tawk.to"),
        blank("Пароль Tawk.to"),

        h2("3.3. Почта для OTP-кодов (Resend)"),
        infoTable([
          ["Сервис", "https://resend.com"],
          ["Отправитель", "СКМ <no-reply@service-skm.ru>"],
          ["Назначение", "Одноразовые коды входа на сайт"],
        ]),
        spacer(),
        blank("Логин Resend (если передаётся)"),
        blank("API-ключ Resend (если передаётся)"),

        h2("3.4. База данных (Turso)"),
        infoTable([
          ["Сервис", "https://turso.tech"],
          ["База", "skm-industrial-demo"],
          ["URL", "libsql://skm-industrial-demo-tanitsu-reberu.aws-eu-west-1.turso.io"],
          ["Назначение", "Пользователи, заказы, счета, заявки на оплату по счёту"],
        ]),
        spacer(),
        blank("Доступ в Turso (если передаётся)"),
        blank("Токен Turso (если передаётся)"),

        h1("4. Что не передаётся по умолчанию"),
        bullet("bullets", "Исходный код и репозиторий GitHub — если не оговорено отдельно в договоре"),
        bullet("bullets", "Секреты сервера: AUTH_SECRET, RESEND_API_KEY, TURSO_AUTH_TOKEN, VERCEL_TOKEN"),
        bullet("bullets", "Пароли админ-панели — каждый администратор задаёт свой"),
        bullet("bullets", "OTP-коды — одноразовые, приходят только на email"),
        p("Пополнение внутреннего баланса на сайте отключено — в передаче не участвует."),

        h1("5. Безопасность после передачи"),
        bullet("bullets", "Сменить пароли в Tawk.to, Vercel, регистраторе домена и Resend"),
        bullet("bullets", "Каждому администратору СКМ — свой пароль админ-панели"),
        bullet("bullets", "При увольнении — убрать email из ADMIN_EMAILS в настройках Vercel"),
        bullet("bullets", "Не передавать пароль админки третьим лицам"),

        h1("6. Поддержка и контакты"),
        p("Период бесплатной технической поддержки: 6 месяцев после передачи."),
        blank("Имя разработчика / исполнителя"),
        blank("Должность"),
        blank("Email / Telegram"),
        p("Контакты компании СКМ:"),
        p("Телефон: +7 991 123 05 07"),
        p("Email: i@ooo-skmoscow.ru"),
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun("Сайт: "),
            new ExternalHyperlink({
              children: [new TextRun({ text: "https://service-skm.ru", style: "Hyperlink" })],
              link: "https://service-skm.ru",
            }),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),
        ...getAdminGuideSections({ partPrefix: "2" }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);

for (const outputPath of outputPaths) {
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    console.log("Saved:", outputPath);
  } catch (error) {
    console.error("Failed:", outputPath, error.message);
  }
}