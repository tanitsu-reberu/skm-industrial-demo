import fs from "node:fs";
import path from "node:path";
import pptxgen from "pptxgenjs";

const root = process.cwd();
const assets = path.join(root, "presentations", "assets");
const presentationName = process.env.PRESENTATION_OUTPUT ?? "Передача сайта.pptx";
const outputDirs = [path.join(root, "Договоренности"), path.join(root, "presentations")];
const outputFile = path.join(outputDirs[0], presentationName);

const C = {
  navy: "0B1F3A",
  navyLight: "132D50",
  red: "E30613",
  white: "FFFFFF",
  ice: "D6E4F5",
  muted: "5C6F87",
  lightBg: "F3F6FB",
  darkText: "1A2B42",
};

const screenshots = path.join(assets, "screenshots");

function asset(primary, fallback) {
  return fs.existsSync(primary) ? primary : fallback;
}

const IMG = {
  logo: path.join(assets, "logo.png"),
  home: asset(path.join(screenshots, "home-desktop.png"), path.join(assets, "1.jpg")),
  services: asset(path.join(screenshots, "services-desktop.png"), path.join(assets, "1.jpg")),
  checkout: asset(path.join(screenshots, "checkout-desktop.png"), path.join(assets, "3.jpg")),
  login: asset(path.join(screenshots, "login-desktop.png"), path.join(assets, "5.jpg")),
  mobileHome: asset(path.join(screenshots, "home-mobile.png"), path.join(assets, "2.jpg")),
  mobileCheckout: asset(path.join(screenshots, "checkout-mobile.png"), path.join(assets, "2.jpg")),
  adminGate: asset(path.join(screenshots, "admin-forbidden-desktop.png"), path.join(screenshots, "login-desktop.png")),
};

for (const [key, file] of Object.entries(IMG)) {
  if (!fs.existsSync(file)) {
    console.error(`Missing asset ${key}: ${file}`);
    process.exit(1);
  }
}

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Разработчик service-skm.ru";
pres.title = "Передача веб-сайта ООО СКМ";
pres.subject = "service-skm.ru";

function addDarkBg(slide) {
  slide.background = { color: C.navy };
}

function addLightBg(slide) {
  slide.background = { color: C.lightBg };
}

function addAccentBar(slide, { vertical = false } = {}) {
  if (vertical) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0,
      y: 0,
      w: 0.12,
      h: 5.625,
      fill: { color: C.red },
      line: { color: C.red, width: 0 },
    });
    return;
  }
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.08,
    fill: { color: C.red },
    line: { color: C.red, width: 0 },
  });
}

function addFooter(slide, text, dark = false) {
  slide.addText(text, {
    x: 0.55,
    y: 5.2,
    w: 8.9,
    h: 0.3,
    fontFace: "Calibri",
    fontSize: 9,
    color: dark ? C.ice : C.muted,
    margin: 0,
  });
}

function addTitle(slide, title, subtitle, { dark = true, x = 0.55, y = 0.45, w = 4.8 } = {}) {
  slide.addText(title, {
    x,
    y,
    w,
    h: 1.1,
    fontFace: "Arial",
    fontSize: 30,
    bold: true,
    color: dark ? C.white : C.navy,
    margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x,
      y: y + 1.05,
      w,
      h: 0.8,
      fontFace: "Calibri",
      fontSize: 14,
      color: dark ? C.ice : C.muted,
      margin: 0,
    });
  }
}

function addBullets(slide, items, { x = 0.55, y = 1.7, w = 4.5, h = 3.2, dark = false } = {}) {
  slide.addText(
    items.map((text, index) => ({
      text,
      options: {
        bullet: true,
        breakLine: index < items.length - 1,
        fontFace: "Calibri",
        fontSize: 14,
        color: dark ? C.ice : C.darkText,
      },
    })),
    { x, y, w, h, valign: "top", margin: 0 },
  );
}

function addImageCard(slide, imagePath, { x, y, w, h, caption }) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x,
    y,
    w,
    h,
    fill: { color: C.white },
    line: { color: "D7DFEA", width: 1 },
    shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 135, opacity: 0.12 },
  });
  slide.addImage({ path: imagePath, x: x + 0.08, y: y + 0.08, w: w - 0.16, h: h - (caption ? 0.42 : 0.16), sizing: { type: "cover", w: w - 0.16, h: h - (caption ? 0.42 : 0.16) } });
  if (caption) {
    slide.addText(caption, {
      x: x + 0.1,
      y: y + h - 0.34,
      w: w - 0.2,
      h: 0.25,
      fontFace: "Calibri",
      fontSize: 10,
      color: C.muted,
      align: "center",
      margin: 0,
    });
  }
}

// 1. Title
{
  const slide = pres.addSlide();
  addDarkBg(slide);
  addAccentBar(slide);
  slide.addImage({ path: IMG.logo, x: 0.7, y: 0.55, w: 1.35, h: 1.35 });
  slide.addText("Передача веб-сайта", {
    x: 2.2,
    y: 0.75,
    w: 7.2,
    h: 0.8,
    fontFace: "Arial",
    fontSize: 34,
    bold: true,
    color: C.white,
    margin: 0,
  });
  slide.addText("service-skm.ru", {
    x: 2.2,
    y: 1.45,
    w: 7.2,
    h: 0.55,
    fontFace: "Arial",
    fontSize: 22,
    color: C.red,
    bold: true,
    margin: 0,
  });
  slide.addText("ООО «СКМ» · вентиляция и холодоснабжение", {
    x: 2.2,
    y: 2.05,
    w: 7.2,
    h: 0.45,
    fontFace: "Calibri",
    fontSize: 15,
    color: C.ice,
    margin: 0,
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.7,
    y: 3.15,
    w: 8.6,
    h: 1.55,
    fill: { color: C.navyLight, transparency: 15 },
    line: { color: C.red, width: 1 },
  });
  slide.addText("Исполнитель: команда разработки веб-платформы", {
    x: 0.95,
    y: 3.35,
    w: 4,
    h: 0.35,
    fontFace: "Calibri",
    fontSize: 13,
    color: C.ice,
    margin: 0,
  });
  slide.addText("Заказчик: ООО «СКМ»", {
    x: 0.95,
    y: 3.75,
    w: 4,
    h: 0.35,
    fontFace: "Calibri",
    fontSize: 13,
    color: C.ice,
    margin: 0,
  });
  slide.addText("Июль 2026", {
    x: 0.95,
    y: 4.15,
    w: 4,
    h: 0.35,
    fontFace: "Calibri",
    fontSize: 13,
    color: C.ice,
    margin: 0,
  });
  addImageCard(slide, IMG.home, { x: 6.55, y: 2.55, w: 2.85, h: 2.35, caption: "service-skm.ru" });
  addFooter(slide, "Коммерческое предложение на передачу готового продукта", true);
}

// 2. Problem
{
  const slide = pres.addSlide();
  addLightBg(slide);
  addAccentBar(slide);
  addTitle(slide, "Проблема", "Старый сайт не отражал реальную деятельность компании", { dark: false });
  addBullets(
    slide,
    [
      "Устаревший облик и слабое представление услуг",
      "Нет онлайн-заказа и прозрачного процесса оплаты",
      "Клиенты уходили в мессенджеры без фиксации заявок",
      "Ручной учёт заказов и счетов отнимал время менеджеров",
    ],
    { dark: false, w: 4.35 },
  );
  addImageCard(slide, IMG.home, {
    x: 5.15,
    y: 0.95,
    w: 4.35,
    h: 4.15,
    caption: "Новый сайт service-skm.ru",
  });
  addFooter(slide, "Слайд 2 · Проблема");
}

// 3. Results
{
  const slide = pres.addSlide();
  addLightBg(slide);
  addAccentBar(slide);
  addTitle(slide, "Что сделано", "Готовый рабочий продукт под задачи СКМ", { dark: false });
  const cards = [
    ["Современный сайт", "12 услуг, адаптив, фирменный стиль"],
    ["Личный кабинет", "Вход по email-коду без пароля"],
    ["Оплата по счёту", "Заявка + согласование в чате"],
    ["Админ-панель", "Заказы, счета, клиенты, экспорт"],
  ];
  cards.forEach(([title, text], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 0.55 + col * 2.35;
    const y = 1.65 + row * 1.55;
    slide.addShape(pres.shapes.RECTANGLE, {
      x,
      y,
      w: 2.15,
      h: 1.25,
      fill: { color: C.white },
      line: { color: "D7DFEA", width: 1 },
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x,
      y,
      w: 0.08,
      h: 1.25,
      fill: { color: C.red },
      line: { color: C.red, width: 0 },
    });
    slide.addText(title, {
      x: x + 0.18,
      y: y + 0.12,
      w: 1.85,
      h: 0.35,
      fontFace: "Arial",
      fontSize: 13,
      bold: true,
      color: C.navy,
      margin: 0,
    });
    slide.addText(text, {
      x: x + 0.18,
      y: y + 0.5,
      w: 1.85,
      h: 0.65,
      fontFace: "Calibri",
      fontSize: 11,
      color: C.muted,
      margin: 0,
    });
  });
  addImageCard(slide, IMG.services, { x: 5.15, y: 1.2, w: 4.35, h: 3.9, caption: "Каталог услуг на production" });
  addFooter(slide, "Слайд 3 · Результаты");
}

// 4. Orders system
{
  const slide = pres.addSlide();
  addDarkBg(slide);
  addAccentBar(slide, { vertical: true });
  addTitle(slide, "Система заказов", "Главное преимущество для бизнеса", { x: 0.75 });
  addBullets(
    slide,
    [
      "Клиент оформляет услугу и оплату по счёту в 2 клика",
      "Детали и итоговая сумма — в онлайн-чате JivoChat",
      "Предоплата и остаток фиксируются отдельными счетами",
      "Прогресс оплаты виден клиенту и администратору",
      "Статусы: обсуждение → счёт → оплата → завершение",
    ],
    { x: 0.75, y: 1.75, w: 4.2, dark: true },
  );
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.75,
    y: 4.55,
    w: 2.1,
    h: 0.75,
    fill: { color: C.red },
    line: { color: C.red, width: 0 },
  });
  slide.addText("до 70%", {
    x: 0.9,
    y: 4.62,
    w: 1.8,
    h: 0.35,
    fontFace: "Arial",
    fontSize: 24,
    bold: true,
    color: C.white,
    margin: 0,
  });
  slide.addText("меньше ручной переписки", {
    x: 0.9,
    y: 4.98,
    w: 1.9,
    h: 0.25,
    fontFace: "Calibri",
    fontSize: 10,
    color: C.white,
    margin: 0,
  });
  addImageCard(slide, IMG.checkout, { x: 5.0, y: 0.85, w: 4.55, h: 4.35, caption: "Оформление оплаты по счёту" });
  addFooter(slide, "Слайд 4 · Система заказов", true);
}

// 5. Admin + mobile + chat
{
  const slide = pres.addSlide();
  addLightBg(slide);
  addAccentBar(slide);
  addTitle(slide, "Управление и коммуникации", "Админ-панель · мобильная версия · онлайн-чат", { dark: false });
  addBullets(
    slide,
    [
      "Админка: пользователи, заказы, счета, заявки",
      "Очередь оплаты по счёту со статусами и комментариями",
      "Экспорт клиентов и заказов в Excel",
      "Сайт корректно работает на телефоне и планшете",
      "JivoChat — консультации без звонков и потери лидов",
    ],
    { dark: false, w: 4.2 },
  );
  addImageCard(slide, IMG.mobileHome, {
    x: 4.95,
    y: 0.95,
    w: 2.05,
    h: 4.15,
    caption: "Мобильная версия + чат",
  });
  addImageCard(slide, IMG.services, {
    x: 7.15,
    y: 0.95,
    w: 2.35,
    h: 2.0,
    caption: "Каталог услуг",
  });
  addImageCard(slide, IMG.mobileCheckout, {
    x: 7.15,
    y: 3.1,
    w: 2.35,
    h: 2.0,
    caption: "Оформление заказа с телефона",
  });
  addFooter(slide, "Слайд 5 · Админ-панель и чат");
}

// 6. Price justification
{
  const slide = pres.addSlide();
  addDarkBg(slide);
  addAccentBar(slide, { vertical: true });
  addTitle(slide, "Стоимость проекта", "Обоснование инвестиции", { x: 0.75 });
  slide.addText("480 000 ₽", {
    x: 0.75,
    y: 1.55,
    w: 3.5,
    h: 0.9,
    fontFace: "Arial",
    fontSize: 44,
    bold: true,
    color: C.red,
    margin: 0,
  });
  slide.addText("разовая передача готового решения", {
    x: 0.75,
    y: 2.35,
    w: 3.8,
    h: 0.35,
    fontFace: "Calibri",
    fontSize: 13,
    color: C.ice,
    margin: 0,
  });
  const priceItems = [
    ["Аналитика и проектирование", "структура услуг, сценарии оплаты"],
    ["Дизайн и вёрстка", "фирменный UI, адаптив, анимации"],
    ["Backend и база данных", "заказы, счета, OTP-вход, админка"],
    ["Интеграции", "почта, чат, хостинг, домен, CI/CD"],
    ["Тестирование и запуск", "production на service-skm.ru"],
  ];
  priceItems.forEach(([title, text], index) => {
    const y = 1.35 + index * 0.78;
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 4.55,
      y,
      w: 5.0,
      h: 0.62,
      fill: { color: C.navyLight, transparency: 10 },
      line: { color: "27466F", width: 1 },
    });
    slide.addText(title, {
      x: 4.72,
      y: y + 0.08,
      w: 2.2,
      h: 0.25,
      fontFace: "Arial",
      fontSize: 12,
      bold: true,
      color: C.white,
      margin: 0,
    });
    slide.addText(text, {
      x: 6.95,
      y: y + 0.1,
      w: 2.45,
      h: 0.4,
      fontFace: "Calibri",
      fontSize: 11,
      color: C.ice,
      margin: 0,
    });
  });
  addFooter(slide, "Слайд 6 · Стоимость", true);
}

// 7. After transfer
{
  const slide = pres.addSlide();
  addLightBg(slide);
  addAccentBar(slide);
  addTitle(slide, "После передачи", "Как сайт продолжит работать", { dark: false });
  const steps = [
    ["1", "Домен service-skm.ru остаётся у заказчика"],
    ["2", "Хостинг Vercel + база Turso — уже настроены"],
    ["3", "Админы входят по корпоративным email"],
    ["4", "Менеджеры ведут заказы и счета в панели"],
    ["5", "Клиенты заказывают услуги и пишут в чат"],
  ];
  steps.forEach(([num, text], index) => {
    const y = 1.45 + index * 0.72;
    slide.addShape(pres.shapes.OVAL, {
      x: 0.65,
      y,
      w: 0.42,
      h: 0.42,
      fill: { color: C.red },
      line: { color: C.red, width: 0 },
    });
    slide.addText(num, {
      x: 0.65,
      y: y + 0.03,
      w: 0.42,
      h: 0.35,
      fontFace: "Arial",
      fontSize: 14,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
    });
    slide.addText(text, {
      x: 1.2,
      y: y + 0.02,
      w: 3.8,
      h: 0.4,
      fontFace: "Calibri",
      fontSize: 14,
      color: C.darkText,
      margin: 0,
    });
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 5.0,
    y: 1.35,
    w: 4.5,
    h: 3.55,
    fill: { color: C.white },
    line: { color: "D7DFEA", width: 1 },
  });
  slide.addText("Технологии", {
    x: 5.25,
    y: 1.55,
    w: 2,
    h: 0.3,
    fontFace: "Arial",
    fontSize: 14,
    bold: true,
    color: C.navy,
    margin: 0,
  });
  addBullets(
    slide,
    ["Next.js 15 · React 19", "Turso / SQLite · OTP-авторизация", "Resend · JivoChat · Vercel"],
    { x: 5.2, y: 1.95, w: 4.1, h: 2.2, dark: false },
  );
  slide.addImage({ path: IMG.logo, x: 7.35, y: 3.45, w: 1.55, h: 1.55 });
  addFooter(slide, "Слайд 7 · Эксплуатация");
}

// 8. Transfer terms
{
  const slide = pres.addSlide();
  addLightBg(slide);
  addAccentBar(slide);
  addTitle(slide, "Условия передачи", "Пакет включён в стоимость", { dark: false });
  addBullets(
    slide,
    [
      "Передача доступов: домен, хостинг, БД, админ-панель",
      "Инструкция для администраторов и менеджеров",
      "Передача исходного кода и репозитория",
      "6 месяцев бесплатной технической поддержки",
      "Исправление ошибок и консультации по работе",
    ],
    { dark: false, w: 4.4 },
  );
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 5.05,
    y: 1.35,
    w: 4.45,
    h: 1.45,
    fill: { color: C.navy },
    line: { color: C.navy, width: 0 },
  });
  slide.addText("6 месяцев", {
    x: 5.3,
    y: 1.55,
    w: 4,
    h: 0.55,
    fontFace: "Arial",
    fontSize: 30,
    bold: true,
    color: C.red,
    margin: 0,
  });
  slide.addText("бесплатной поддержки после передачи", {
    x: 5.3,
    y: 2.1,
    w: 3.9,
    h: 0.45,
    fontFace: "Calibri",
    fontSize: 14,
    color: C.ice,
    margin: 0,
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 5.05,
    y: 3.0,
    w: 4.45,
    h: 1.9,
    fill: { color: C.white },
    line: { color: "D7DFEA", width: 1 },
  });
  slide.addText("В передачу входит", {
    x: 5.25,
    y: 3.15,
    w: 4,
    h: 0.3,
    fontFace: "Arial",
    fontSize: 13,
    bold: true,
    color: C.navy,
    margin: 0,
  });
  addBullets(
    slide,
    ["Документация и доступы", "Обучение администратора", "Гарантия стабильной работы"],
    { x: 5.15, y: 3.5, w: 4.1, h: 1.3, dark: false },
  );
  addFooter(slide, "Слайд 8 · Условия");
}

// 9. CTA
{
  const slide = pres.addSlide();
  addDarkBg(slide);
  addAccentBar(slide);
  slide.addImage({ path: IMG.logo, x: 0.7, y: 0.55, w: 1.1, h: 1.1 });
  addTitle(slide, "Следующий шаг", "Подписание счёта и акта приёма-передачи", { x: 2.0, y: 0.65, w: 5.5 });
  addBullets(
    slide,
    [
      "Согласовать передачу сайта service-skm.ru",
      "Подписать счёт на 480 000 ₽",
      "Подписать акт выполненных работ",
      "Получить доступы и начать работу в админ-панели",
    ],
    { x: 0.7, y: 2.0, w: 4.6, dark: true },
  );
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.7,
    y: 4.35,
    w: 3.2,
    h: 0.65,
    fill: { color: C.red },
    line: { color: C.red, width: 0 },
  });
  slide.addText("Готовы передать проект", {
    x: 0.85,
    y: 4.5,
    w: 2.9,
    h: 0.35,
    fontFace: "Arial",
    fontSize: 15,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });
  addImageCard(slide, IMG.login, { x: 5.35, y: 1.15, w: 4.15, h: 3.95, caption: "Вход в личный кабинет по email-коду" });
  slide.addText("Для согласования счёта и акта — свяжитесь с исполнителем", {
    x: 0.7,
    y: 5.05,
    w: 5.2,
    h: 0.3,
    fontFace: "Calibri",
    fontSize: 11,
    color: C.ice,
    margin: 0,
  });
  addFooter(slide, "Слайд 9 · Контакты", true);
}

for (const dir of outputDirs) fs.mkdirSync(dir, { recursive: true });
await pres.writeFile({ fileName: outputFile });
for (const dir of outputDirs.slice(1)) {
  const copyPath = path.join(dir, presentationName);
  fs.copyFileSync(outputFile, copyPath);
  console.log(`Created: ${copyPath}`);
}
console.log(`Created: ${outputFile}`);