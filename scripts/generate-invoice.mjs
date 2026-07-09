import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { blank, p, paragraphStyles, spacer } from "./docx-shared.mjs";

import { agreementsOutputPaths } from "./docx-output-paths.mjs";

const outputPaths = agreementsOutputPaths("Счёт_на_разработку_сайта_480000_СКМ.docx");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function money(value) {
  return `${value.toLocaleString("ru-RU")}`;
}

function tableCell(text, { header = false, width, alignRight = false, bold = false } = {}) {
  return new TableCell({
    borders,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: header ? { fill: "E8EEF7", type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: alignRight ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text, bold: header || bold })],
      }),
    ],
  });
}

const items = [
  ["Проектирование структуры сайта, сценариев заказов и базы данных", 60_000],
  ["Разработка дизайна и пользовательского интерфейса", 80_000],
  ["Разработка backend: OTP-авторизация, личный кабинет, заказы, оплата по счёту", 90_000],
  ["Разработка админ-панели: заказы, счета, заявки, пользователи, экспорт", 80_000],
  ["Переработка сайта под специализацию (вентиляция, чиллеры, фанкойлы)", 50_000],
  ["Система заказов: предоплата, счета, прогресс оплаты, согласование в чате", 70_000],
  ["Адаптация сайта под мобильные устройства", 30_000],
  ["Интеграция JivoChat, почта OTP (Resend), SEO, запуск на production", 20_000],
];

const total = items.reduce((sum, [, amount]) => sum + amount, 0);

function invoiceTable() {
  const rows = [
    new TableRow({
      children: [
        tableCell("№ п/п", { header: true, width: 900 }),
        tableCell("Наименование работ (услуг)", { header: true, width: 6326 }),
        tableCell("Сумма, руб.", { header: true, width: 1800, alignRight: true }),
      ],
    }),
    ...items.map(([title, amount], index) =>
      new TableRow({
        children: [
          tableCell(String(index + 1), { width: 900, alignRight: true }),
          tableCell(title, { width: 6326 }),
          tableCell(money(amount), { width: 1800, alignRight: true }),
        ],
      }),
    ),
    new TableRow({
      children: [
        tableCell("", { width: 900 }),
        tableCell("ИТОГО:", { width: 6326, bold: true, alignRight: true }),
        tableCell(money(total), { width: 1800, alignRight: true, bold: true }),
      ],
    }),
  ];

  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [900, 6326, 1800],
    rows,
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles,
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: "СЧЁТ", bold: true, size: 36, color: "0B1F3A" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: "на оказание услуг по разработке веб-сайта service-skm.ru", size: 24 })],
        }),

        p("№ ______ от «____» ______________ 2026 г.", { bold: true }),
        spacer(),
        p("Исполнитель: Фатеев Константин Игоревич, самозанятый"),
        p("Заказчик: ООО «СКМ»"),
        p("Предмет: разработка и передача веб-сайта service-skm.ru"),
        spacer(),

        invoiceTable(),
        spacer(),

        p("В том числе НДС: не облагается (применяется специальный налоговый режим «Налог на профессиональный доход»).", {
          italics: true,
        }),
        p(
          "Примечание: в стоимость включены хостинг (Vercel) на период разработки и первые 6 (шесть) месяцев после передачи сайта, а также бесплатная техническая поддержка в течение 6 (шести) месяцев после подписания акта приёма-передачи.",
          { italics: true },
        ),
        p(
          "Результат работ: веб-сайт https://service-skm.ru с личным кабинетом, админ-панелью, системой заказов и оплаты по счёту, онлайн-чатом.",
        ),

        spacer(),
        p("Банковские реквизиты исполнителя:", { bold: true }),
        blank("ИНН"),
        blank("Расчётный счёт"),
        blank("Банк"),
        blank("БИК"),
        blank("Корр. счёт"),
        p("Назначение платежа: Оплата по счёту № ___ от __.__.2026 за разработку сайта service-skm.ru. Без НДС."),

        spacer(),
        p("Исполнитель: _________________ / Фатеев К.И. /"),
        p("М.П."),
        spacer(),
        new Paragraph({
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