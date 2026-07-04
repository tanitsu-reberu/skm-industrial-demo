import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";

const outputPath = path.join(
  process.env.USERPROFILE ?? "",
  "Downloads",
  "Список_доступов_для_передачи.docx",
);

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}

function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}

function bullet(ref, text) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun(text)],
  });
}

function numbered(ref, text) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun(text)],
  });
}

function blank(label) {
  return p(`${label}: _______________________________`);
}

function infoTable(rows) {
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [3200, 5826],
    rows: [
      new TableRow({
        children: [cell("Параметр", true), cell("Значение", true)],
      }),
      ...rows.map(([a, b]) => new TableRow({ children: [cell(a), cell(b)] })),
    ],
  });
}

function cell(text, header = false) {
  return new TableCell({
    borders,
    width: { size: header ? 3200 : 3200, type: WidthType.DXA },
    shading: header ? { fill: "E8EEF7", type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: header })] })],
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F3864" },
        paragraph: { spacing: { before: 240, after: 180 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E5E9E" },
        paragraph: { spacing: { before: 200, after: 140 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "steps",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
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
                new TextRun("ООО СКМ — список доступов | Стр. "),
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
          children: [new TextRun({ text: "Список доступов для передачи", bold: true, size: 36, color: "1F3864" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: "Веб-сайт service-skm.ru — ООО СКМ", size: 26 })],
        }),
        p("Дата: 04.07.2026"),

        h1("1. Доступы, которые необходимо передать"),
        p(
          "На сайте нет обычного логина и пароля. Вход администратора — в два шага: одноразовый код на email, затем отдельный пароль админ-панели.",
        ),

        h2("1.1. Административный доступ к сайту"),
        infoTable([
          ["Сайт", "https://service-skm.ru"],
          ["Админ-панель", "https://service-skm.ru/admin"],
          ["Вход на сайт", "https://service-skm.ru/login"],
          ["Административные email", "fateewkostik@hotmail.com\nskm.moskow.www@gmail.com\nooo-skmoscow@yandex.ru"],
          ["Способ входа на сайт", "OTP-код на email (пароля от сайта нет)"],
          ["Пароль админ-панели", "Задаётся администратором при первом входе (см. ниже)"],
        ]),
        new Paragraph({ spacing: { after: 200 }, children: [] }),

        h2("1.2. Как войти в админ-панель"),
        numbered("steps", "Откройте https://service-skm.ru/login"),
        numbered("steps", "Введите одну из административных почт из списка выше"),
        numbered("steps", "Получите одноразовый код (OTP) на email и введите его"),
        numbered("steps", "Откройте https://service-skm.ru/admin"),
        numbered("steps", "При первом входе придумайте пароль админ-панели (не короче 8 символов)"),
        numbered("steps", "При следующих входах вводите этот пароль"),
        p(
          "Важно: пароль админ-панели хранится в базе только в зашифрованном виде. Его нельзя посмотреть после установки — только сбросить и задать новый.",
          { italics: true },
        ),
        p("Доступ к админке после ввода пароля сохраняется 24 часа на этом устройстве. Сессия на сайте — 7 дней."),

        h2("1.3. Домен service-skm.ru"),
        infoTable([
          ["Домен", "service-skm.ru"],
          ["Хостинг сайта", "Vercel (https://vercel.com)"],
          ["Репозиторий кода", "https://github.com/tanitsu-reberu/skm-industrial-demo"],
        ]),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        blank("Логин в Vercel (если передаётся)"),
        blank("Пароль / доступ в Vercel (если передаётся)"),
        blank("Логин у регистратора домена (Timeweb или иной)"),
        blank("Пароль у регистратора домена"),

        h2("1.4. Онлайн-чат (Tawk.to)"),
        infoTable([
          ["Кабинет", "https://dashboard.tawk.to"],
          ["Property ID", "6a4835babb890f1d47e70e94"],
          ["Widget ID", "default"],
        ]),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        blank("Логин Tawk.to"),
        blank("Пароль Tawk.to"),

        h2("1.5. Почта для кодов входа (Resend)"),
        infoTable([
          ["Сервис", "https://resend.com"],
          ["Отправитель OTP", "СКМ <no-reply@service-skm.ru>"],
        ]),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        blank("Логин Resend (если передаётся)"),
        blank("Пароль Resend (если передаётся)"),

        h2("1.6. База данных (Turso)"),
        infoTable([
          ["Сервис", "https://turso.tech"],
          ["База", "skm-industrial-demo"],
        ]),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        blank("Доступ в Turso (если передаётся)"),

        h1("2. Доступы, которые не передаются (по умолчанию)"),
        bullet("bullets", "Исходный код сайта и репозиторий GitHub — остаются у разработчика, если не оговорено иное"),
        bullet("bullets", "API-ключи: Resend, Turso, Vercel, AUTH_SECRET"),
        bullet("bullets", "Пароль админ-панели — не передаётся; каждый администратор задаёт свой при первом входе"),
        bullet("bullets", "OTP-коды — одноразовые, приходят только на почту администратора"),

        h1("3. Рекомендации по безопасности"),
        bullet("bullets", "После передачи сменить пароли в Tawk.to, Vercel, регистраторе домена и Resend"),
        bullet("bullets", "Каждому администратору СКМ — свой пароль админ-панели на своей почте"),
        bullet("bullets", "Не сообщать пароль админ-панели третьим лицам"),
        bullet("bullets", "При увольнении сотрудника — убрать его email из ADMIN_EMAILS на Vercel"),
        bullet("bullets", "Подробная инструкция по работе: «Инструкция администратора СКМ.docx»"),

        h1("4. Контакты после передачи"),
        blank("Имя разработчика / исполнителя"),
        blank("Должность"),
        blank("Email / Telegram"),
        p("Период бесплатной поддержки: около 6 месяцев"),
        new Paragraph({
          spacing: { before: 240 },
          children: [new TextRun({ text: "Документ актуализирован: 04.07.2026", italics: true, color: "666666" })],
        }),
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
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buffer);
console.log("Saved:", outputPath);