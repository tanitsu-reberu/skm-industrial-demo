import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { blank, bullet, h1, h2, h3, infoTable, numbered, numberingConfig, p, paragraphStyles, spacer, statusTable } from "./docx-shared.mjs";

import { agreementsOutputPaths } from "./docx-output-paths.mjs";

const outputPaths = agreementsOutputPaths("План_передачи_сайта_СКМ.docx");

function check(text) {
  return bullet("bullets", `☐ ${text}`);
}

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
                new TextRun("ООО СКМ — план передачи service-skm.ru | Стр. "),
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
          children: [new TextRun({ text: "План передачи веб-сайта", bold: true, size: 36, color: "0B1F3A" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: "service-skm.ru — ООО «СКМ»", size: 28, bold: true })],
        }),

        infoTable([
          ["Дата составления", "04.07.2026"],
          ["Исполнитель", "Фатеев Константин Игоревич (самозанятый)"],
          ["Заказчик", "ООО «СКМ»"],
          ["Стоимость передачи", "480 000 ₽"],
          ["Поддержка", "6 месяцев бесплатно после подписания акта"],
          ["Модель оплаты на сайте", "Только по счёту, согласование в чате JivoChat"],
        ]),
        spacer(),

        h1("Этап 1. Подготовка (исполнитель)"),
        h2("1.1. Финальная проверка сайта"),
        p("Проверить на production: https://service-skm.ru"),
        check("Вход клиента по OTP-коду на email (/login)"),
        check("Личный кабинет: заказы, счета, заявки на оплату по счёту (/account)"),
        check("Оформление услуги: кнопка «Оформить оплату по счёту» (/checkout)"),
        check("Онлайн-чат JivoChat открывается и отвечает"),
        check("Админ-панель: заказы, заявки на оплату по счёту, заявки с сайта, пользователи (/admin)"),
        check("Создание счёта, подтверждение оплаты, прогресс «оплачено из суммы»"),
        check("Мобильная версия главной, каталога и checkout"),
        check("Отсутствие критических ошибок в production-сборке"),

        h2("1.2. Подготовка доступов"),
        p("Убедиться, что административные email заказчика указаны в ADMIN_EMAILS на Vercel:"),
        bullet("bullets", "fateewkostik@hotmail.com"),
        bullet("bullets", "skm.moskow.www@gmail.com"),
        bullet("bullets", "i@skmoscow.ru"),
        check("Каждый администратор СКМ прошёл первый вход и задал пароль админ-панели"),
        check("Подготовлен файл «Список_доступов_для_передачи.docx» (с инструкцией)"),
        check("Логины и пароли внешних сервисов записаны для передачи (по согласованию)"),

        h2("1.3. Комплект документов"),
        check("Счёт на 480 000 ₽"),
        check("Акт приёма-передачи веб-сайта"),
        check("Настоящий план передачи"),
        check("Список доступов для передачи"),
        check("Инструкция администратора"),
        check("Презентация и текст выступления (при необходимости)"),

        h1("Этап 2. Передача домена и хостинга"),
        h2("2.1. Домен service-skm.ru"),
        p("Домен привязан к хостингу Vercel. DNS: ns1.vercel-dns.com, ns2.vercel-dns.com."),
        numbered("steps", "Исполнитель инициирует перенос домена / доступа к регистратору"),
        numbered("steps", "Заказчик принимает домен на свой аккаунт"),
        numbered("steps", "Исполнитель проверяет, что сайт открывается на service-skm.ru после переноса"),
        numbered("steps", "Стороны фиксируют успешный перенос в переписке или акте"),
        p("Ориентировочный срок: 1–3 рабочих дня (зависит от регистратора)."),
        spacer(),
        blank("Регистратор домена / аккаунт заказчика"),
        blank("Дата подтверждения переноса домена"),

        h2("2.2. Хостинг Vercel"),
        infoTable([
          ["Платформа", "Vercel — https://vercel.com"],
          ["Проект", "skm-industrial-demo"],
          ["Production URL", "https://service-skm.ru"],
        ]),
        p("Передача аккаунта Vercel — по отдельному согласованию в договоре. Минимум: сайт остаётся работать на домене заказчика."),
        spacer(),
        blank("Передаётся ли доступ в Vercel (да / нет)"),
        blank("Логин Vercel заказчика (если передаётся)"),

        h1("Этап 3. Передача доступа к сайту и сервисам"),
        h2("3.1. Что передаётся заказчику"),
        bullet("bullets", "Рабочий сайт на домене service-skm.ru"),
        bullet("bullets", "Вход администраторов по корпоративным email (OTP + пароль админ-панели)"),
        bullet("bullets", "Доступ к онлайн-чату JivoChat"),
        bullet("bullets", "Документация: список доступов, инструкция администратора, план передачи"),
        bullet("bullets", "По согласованию: Resend, Turso, репозиторий GitHub"),

        h2("3.2. Что не передаётся по умолчанию"),
        bullet("bullets", "Исходный код и репозиторий GitHub"),
        bullet("bullets", "Секреты сервера: AUTH_SECRET, API-ключи"),
        bullet("bullets", "Пароли админ-панели (каждый админ задаёт свой)"),
        bullet("bullets", "OTP-коды (одноразовые, только на email)"),

        h2("3.3. Порядок передачи доступа к админке"),
        numbered("steps", "Исполнитель передаёт файл «Список_доступов_для_передачи.docx»"),
        numbered("steps", "Представитель СКМ входит на /login под административной почтой"),
        numbered("steps", "Получает OTP, открывает /admin, задаёт пароль админ-панели"),
        numbered("steps", "Проверяет разделы: заказы, заявки на оплату по счёту, пользователи"),
        numbered("steps", "Исполнитель проводит краткий инструктаж (30–60 минут)"),
        check("Заказчик подтвердил успешный вход и работу админ-панели"),

        h2("3.4. Внешние сервисы"),
        statusTable([
          ["JivoChat", "Чат на сайте — логин/пароль передаются отдельно"],
          ["Resend", "OTP-коды на email — по согласованию"],
          ["Turso", "База данных — по согласованию"],
        ]),

        h1("Этап 4. Подписание документов и оплата"),
        h2("4.1. Документы"),
        bullet("bullets", "Счёт на 480 000 ₽"),
        bullet("bullets", "Акт приёма-передачи веб-сайта service-skm.ru"),

        h2("4.2. Порядок"),
        numbered("steps", "Исполнитель направляет счёт и проект акта заказчику"),
        numbered("steps", "Заказчик оплачивает счёт"),
        numbered("steps", "Стороны подписывают акт приёма-передачи"),
        numbered("steps", "Исполнитель передаёт доступы и комплект документов"),
        numbered("steps", "Передача считается завершённой с даты подписания акта"),
        check("Счёт оплачен"),
        check("Акт подписан обеими сторонами"),

        h1("Этап 5. Техническая поддержка (6 месяцев)"),
        h3("5.1. Входит в поддержку"),
        bullet("bullets", "Исправление ошибок в работе сайта"),
        bullet("bullets", "Консультации по админ-панели и сценарию «оплата по счёту»"),
        bullet("bullets", "Мелкие правки по согласованию"),
        bullet("bullets", "Помощь с настройкой JivoChat"),

        h3("5.2. Не входит в поддержку"),
        bullet("bullets", "Разработка нового крупного функционала"),
        bullet("bullets", "Полный редизайн или смена бизнес-модели сайта"),
        bullet("bullets", "Перенос на другую платформу"),
        bullet("bullets", "Работы свыше 4 часов в месяц без отдельного согласования"),

        h3("5.3. Обращения"),
        p("Заказчик направляет запросы исполнителю по email или Telegram."),
        p("Срок реакции: 1–2 рабочих дня."),
        blank("Email / Telegram исполнителя для поддержки"),

        h1("Этап 6. Завершение передачи"),
        p("После всех этапов:"),
        bullet("bullets", "Сайт работает на домене заказчика"),
        bullet("bullets", "Администраторы СКМ входят в /admin"),
        bullet("bullets", "Документы подписаны, счёт оплачен"),
        bullet("bullets", "Начинается период бесплатной поддержки — 6 месяцев"),
        check("Все пункты этапов 1–5 выполнены"),
        check("Заказчик принял сайт без замечаний (или с перечнем замечаний в акте)"),

        spacer(),
        p("Подписи сторон:", { bold: true }),
        blank("Исполнитель"),
        p("_________________ / Фатеев К.И. /"),
        spacer(),
        blank("Заказчик"),
        p("_________________ / _________________ /    М.П."),
        spacer(),
        new Paragraph({
          children: [
            new TextRun("Сайт: "),
            new ExternalHyperlink({
              children: [new TextRun({ text: "https://service-skm.ru", style: "Hyperlink" })],
              link: "https://service-skm.ru",
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ text: "Документ подготовлен: 04.07.2026", italics: true, color: "666666" })],
        }),
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