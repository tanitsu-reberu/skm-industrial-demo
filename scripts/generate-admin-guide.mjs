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

const desktop = path.join(process.env.USERPROFILE ?? "", "OneDrive", "Desktop");
const outputPath = path.join(desktop, "Инструкция администратора СКМ.docx");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}

function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}

function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
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

function statusTable(rows) {
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [2800, 6226],
    rows: [
      new TableRow({
        children: [
          cell("Статус", true),
          cell("Значение", true),
        ],
      }),
      ...rows.map(([a, b]) =>
        new TableRow({
          children: [cell(a), cell(b)],
        }),
      ),
    ],
  });
}

function cell(text, header = false) {
  return new TableCell({
    borders,
    width: { size: header ? 2800 : 2800, type: WidthType.DXA },
    shading: header ? { fill: "E8EEF7", type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: header })] })],
  });
}

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 24 } },
    },
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
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 160, after: 120 }, outlineLevel: 2 },
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
                new TextRun("ООО СКМ — инструкция администратора | Стр. "),
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
          children: [new TextRun({ text: "ООО СКМ", bold: true, size: 40, color: "1F3864" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: "Инструкция администратора сайта service-skm.ru", size: 28, bold: true })],
        }),
        p("Версия: июль 2026"),
        p("Сайт: ", {}),
        new Paragraph({
          spacing: { after: 240 },
          children: [
            new ExternalHyperlink({
              children: [new TextRun({ text: "https://service-skm.ru", style: "Hyperlink" })],
              link: "https://service-skm.ru",
            }),
          ],
        }),

        h1("1. Кто является администратором"),
        p(
          "Администратором считается пользователь, вошедший под одной из почт, указанных в настройках сервера (переменная ADMIN_EMAILS). Сейчас это:",
        ),
        bullet("bullets", "fateewkostik@hotmail.com"),
        bullet("bullets", "skm.moskow.www@gmail.com"),
        bullet("bullets", "ooo-skmoscow@yandex.ru"),
        p("Обычные клиенты, даже если у них есть личный кабинет, в админ-панель попасть не могут."),

        h1("2. Вход в админ-панель"),
        h2("2.1. Первый шаг — вход на сайт"),
        numbered("steps", "Откройте https://service-skm.ru/login"),
        numbered("steps", "Введите административную почту"),
        numbered("steps", "Получите одноразовый код (OTP) на email и введите его в форму"),
        numbered("steps", "После входа откройте https://service-skm.ru/admin"),
        p("Если вы не вошли в аккаунт, сайт автоматически перенаправит на страницу входа."),

        h2("2.2. Второй шаг — дополнительный пароль админки"),
        p(
          "После OTP-входа админ-панель защищена отдельным паролем. Это не пароль от почты, а индивидуальный пароль только для /admin.",
        ),
        bullet("bullets", "При первом входе система попросит придумать пароль (не короче 8 символов)"),
        bullet("bullets", "При следующих входах нужно ввести этот пароль"),
        bullet("bullets", "Доступ к админке после ввода пароля сохраняется 24 часа на этом устройстве"),
        bullet("bullets", "Пароль хранится в базе только в зашифрованном виде"),
        p(
          "Важно: если пароль админки был сброшен, при следующем входе нужно задать новый. Это касается почты skm.moskow.www@gmail.com.",
        ),

        h1("3. Обзор админ-панели"),
        p("В админке доступны следующие разделы:"),
        bullet("bullets", "Сводка — количество пользователей, заказов, заявок"),
        bullet("bullets", "Пользователи — список клиентов, баланс, активность"),
        bullet("bullets", "Заказы — управление заказами, счетами и оплатами"),
        bullet("bullets", "Заявки на пополнение баланса"),
        bullet("bullets", "Заявки на оплату услуги по счёту (устаревший поток, если клиент оформил через старую форму)"),
        bullet("bullets", "Заявки с формы «Оставить заявку» на сайте"),
        bullet("bullets", "Транзакции — история операций по балансу"),
        p("После каждого действия карточки обновляются автоматически, перезагружать страницу не нужно."),

        h1("4. Работа с пользователями"),
        h2("4.1. Просмотр"),
        p("В таблице пользователей видны email, баланс, дата регистрации, последняя активность, количество заказов и сумма оплат."),
        h2("4.2. Корректировка баланса"),
        numbered("steps", "Выберите пользователя в списке"),
        numbered("steps", "Укажите сумму"),
        numbered("steps", "Нажмите «+» для пополнения или «−» для списания"),
        numbered("steps", "При необходимости добавьте комментарий к операции"),
        p("Баланс не может стать отрицательным. Каждая корректировка записывается в транзакции."),
        h2("4.3. Удаление пользователя"),
        p("Удаление доступно через кнопку с иконкой корзины. Для подтверждения нужно ввести слово DELETE."),
        bullet("bullets", "Нельзя удалить самого себя (текущего администратора)"),
        bullet("bullets", "Удаление необратимо вместе со связанными данными пользователя"),

        h1("5. Заказы и оплата по счёту"),
        p("Основной сценарий: клиент на странице услуги нажимает «Оплатить по счёту». Создаётся заказ со статусом «Обсуждение»."),
        h2("5.1. Что видит администратор по заказу"),
        bullet("bullets", "Название и описание заказа"),
        bullet("bullets", "Общая сумма (total_amount)"),
        bullet("bullets", "Оплачено (paid_amount)"),
        bullet("bullets", "Статус заказа"),
        bullet("bullets", "Список счетов и подтверждённых оплат"),
        h2("5.2. Изменение заказа"),
        numbered("steps", "Откройте карточку заказа в разделе «Заказы»"),
        numbered("steps", "Измените общую сумму, описание или статус"),
        numbered("steps", "Сохраните изменения"),
        p("Если оплаченная сумма уже равна или больше общей суммы, заказ автоматически переводится в статус «Оплачен»."),
        h2("5.3. Выставление счетов"),
        numbered("steps", "В карточке заказа укажите сумму счёта"),
        numbered("steps", "Выберите тип счёта: предоплата, остаток или полная оплата"),
        numbered("steps", "Нажмите создать счёт"),
        p("Счёт создаётся со статусом «Подготовлен». Далее можно отметить его как «Отправлен» или «Отменён»."),
        h2("5.4. Подтверждение оплаты счёта"),
        numbered("steps", "Когда клиент оплатил счёт, нажмите «Подтвердить оплату» у нужного счёта"),
        numbered("steps", "Система увеличит paid_amount заказа"),
        numbered("steps", "При полной оплате заказ автоматически станет «Оплачен»"),
        p("Также можно добавить ручную оплату без привязки к счёту — если клиент перевёл деньги напрямую."),
        h2("5.5. Статусы заказа"),
        statusTable([
          ["Новый / Обсуждение", "Заказ создан, идёт согласование"],
          ["Сумма согласована", "Стоимость утверждена с клиентом"],
          ["В работе", "Выполняются работы"],
          ["Работы завершены", "Работы сделаны, ожидается финальная оплата"],
          ["Оплачен", "Заказ полностью оплачен"],
          ["Отменён", "Заказ отменён"],
        ]),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        h2("5.6. Статусы счетов"),
        statusTable([
          ["Подготовлен", "Счёт создан в системе"],
          ["Отправлен", "Счёт отправлен клиенту"],
          ["Оплачен", "Оплата подтверждена администратором"],
          ["Отменён", "Счёт отменён"],
        ]),

        h1("6. Заявки на пополнение баланса"),
        p("Клиент в личном кабинете создаёт заявку на пополнение внутреннего баланса. Обработка идёт по цепочке статусов:"),
        numbered("steps", "Новая заявка — нажмите «Взять в работу»"),
        numbered("steps", "В обработке — укажите сумму счёта и отметьте «Счёт отправлен»"),
        numbered("steps", "Счёт отправлен — после получения оплаты отметьте «Оплачено»"),
        numbered("steps", "Оплачено — нажмите «Зачислить на баланс», деньги поступят клиенту"),
        p("После зачисления заявка получает статус «Зачислено», баланс клиента увеличивается, операция попадает в транзакции."),

        h1("7. Заявки «Оставить заявку»"),
        p("Заявки с главной страницы и других разделов сайта попадают в админку автоматически."),
        bullet("bullets", "Просматривайте имя, телефон и комментарий клиента"),
        bullet("bullets", "Меняйте статус: Новая → В работе → Обработана"),
        bullet("bullets", "Удаляйте обработанные заявки при необходимости"),

        h1("8. Безопасность и выход"),
        bullet("bullets", "Не сообщайте дополнительный пароль админки третьим лицам"),
        bullet("bullets", "Закрыть доступ к админке на 24 часа можно через «Закрыть доступ к админ-панели» в шапке сайта"),
        bullet("bullets", "Полный выход из аккаунта — кнопка «Выйти» в шапке"),
        bullet("bullets", "OTP-код действует 15 минут; повторный запрос — не чаще 1 раза в минуту"),

        h1("9. Что видит клиент"),
        p("После ваших действий клиент в личном кабинете видит:"),
        bullet("bullets", "Актуальный баланс и историю транзакций"),
        bullet("bullets", "Свои заказы с прогрессом «оплачено из общей суммы»"),
        bullet("bullets", "Список счетов и их статусы"),
        bullet("bullets", "Заявки на пополнение и оплату по счёту"),

        h1("10. Частые вопросы"),
        h3("Не приходит код на почту"),
        bullet("bullets", "Проверьте папку «Спам»"),
        bullet("bullets", "Подождите 1–2 минуты и запросите код снова"),
        bullet("bullets", "Убедитесь, что вводите ту же почту, что указана в ADMIN_EMAILS"),
        h3("Пишет «Доступ запрещён»"),
        p("Вы вошли под обычной почтой клиента, не из списка администраторов."),
        h3("Пишет «Недостаточно прав»"),
        p("Сессия дополнительного пароля админки истекла. Откройте /admin и введите пароль снова."),
        h3("Нельзя подтвердить оплату счёта"),
        p("Проверьте, что счёт не отменён и ещё не оплачен. Для заявок на пополнение — что статус «Счёт отправлен»."),

        h1("11. Контакты поддержки сайта"),
        p("Телефон: +7 991 123 05 07"),
        p("Email компании: i@ooo-skmoscow.ru"),
        new Paragraph({
          spacing: { before: 240 },
          children: [new TextRun({ text: "Конец инструкции", italics: true, color: "666666" })],
        }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buffer);
console.log("Saved:", outputPath);