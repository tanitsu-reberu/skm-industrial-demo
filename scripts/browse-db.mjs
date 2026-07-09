/**
 * Просмотр базы без Turso CLI.
 *
 * Usage:
 *   npm run db:browse
 *   node scripts/browse-db.mjs flow
 *   node scripts/browse-db.mjs users
 *   node scripts/browse-db.mjs orders 20
 *   node scripts/browse-db.mjs service_invoice_requests 10
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const TABLE_INFO = {
  users: "Пользователи сайта (email, роль; balance — legacy, не используется в UI)",
  otp_codes: "Одноразовые коды входа (только хэши)",
  orders: "Заказы услуг. payment_method=invoice — актуальный способ оплаты",
  invoices: "Счета по заказам (предоплата / остаток / полная оплата)",
  payments: "Подтверждённые оплаты по заказам",
  transactions: "[legacy] Аудит операций; пополнение баланса отключено",
  service_invoice_requests:
    "Заявки на оплату по счёту — основной поток после оформления на сайте",
  contact_requests: "Заявки с формы «Оставить заявку» на главной",
  topup_requests: "[legacy] Старые заявки на пополнение баланса — UI удалён",
  balance_topup_requests: "[legacy] Устаревшая таблица, мигрирована в topup_requests",
};

const LEGACY_TABLES = new Set(["transactions", "topup_requests", "balance_topup_requests"]);

const SERVICE_INVOICE_STATUSES = {
  pending: "Новая — клиент оформил оплату по счёту, ждёт менеджера в JivoChat",
  processing: "В работе — менеджер согласует детали и сумму в чате",
  invoice_sent: "Счёт отправлен клиенту",
  paid: "Оплата получена, можно завершить заявку",
  completed: "Закрыта — заказ переведён в paid",
};

const ORDER_STATUSES = {
  new: "Новый",
  in_discussion: "Обсуждение в чате (стартовый статус при оплате по счёту)",
  price_agreed: "Сумма согласована",
  in_progress: "В работе",
  completed: "Работы завершены",
  paid: "Оплачен",
  cancelled: "Отменён",
  created: "[legacy]",
  awaiting_payment: "[legacy] Ожидание оплаты картой",
};

function printFlowHelp() {
  console.log("Актуальный поток оплаты (только по счёту):");
  console.log("");
  console.log("1. Клиент на /checkout или в диалоге «Заказать услугу»");
  console.log("   → requestServiceInvoicePaymentAction");
  console.log("   → INSERT orders (payment_method=invoice, status=in_discussion)");
  console.log("   → INSERT service_invoice_requests (status=pending)");
  console.log("");
  console.log("2. Клиент пишет в JivoChat — согласование деталей и итоговой суммы");
  console.log("");
  console.log("3. Админ в /admin → «Заявки на оплату услуг по счёту»:");
  console.log("   pending → processing → invoice_sent → paid → completed");
  console.log("");
  console.log("Связанные таблицы: orders ↔ service_invoice_requests ↔ invoices ↔ payments");
  console.log("");
  console.log("Статусы service_invoice_requests:");
  for (const [status, hint] of Object.entries(SERVICE_INVOICE_STATUSES)) {
    console.log(`  ${status}: ${hint}`);
  }
  console.log("");
  console.log("Legacy (не используется в UI): topup_requests, balance_topup_requests, users.balance");
}

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function resolveDatabaseUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  return `file:${path.join(process.cwd(), "data", "skm.sqlite")}`;
}

function maskSensitive(tableName, row) {
  if (tableName !== "users") return row;
  if (!("admin_panel_password" in row)) return row;
  return {
    ...row,
    admin_panel_password: row.admin_panel_password ? "[hash hidden]" : null,
  };
}

function printRows(rows) {
  if (rows.length === 0) {
    console.log("(пусто)");
    return;
  }

  console.log(JSON.stringify(rows, null, 2));
}

loadEnvLocal();

const url = resolveDatabaseUrl();
const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const tableArg = process.argv[2]?.trim();
const limitArg = Number.parseInt(process.argv[3] ?? "50", 10);
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.min(limitArg, 500) : 50;

console.log("database:", url.startsWith("libsql://") ? url : path.basename(url));
console.log("");

const tablesResult = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);

const tables = tablesResult.rows.map((row) => String(row[0] ?? row.name));

if (!tableArg || tableArg === "help" || tableArg === "--help") {
  if (tableArg === "help" || tableArg === "--help") {
    printFlowHelp();
    process.exit(0);
  }

  console.log("Таблицы:");
  for (const table of tables) {
    const countResult = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
    const count = countResult.rows[0]?.[0] ?? countResult.rows[0]?.count ?? 0;
    const legacy = LEGACY_TABLES.has(table) ? " [legacy]" : "";
    const hint = TABLE_INFO[table] ? ` — ${TABLE_INFO[table]}` : "";
    console.log(`- ${table}: ${count}${legacy}${hint}`);
  }
  console.log("");
  printFlowHelp();
  console.log("");
  console.log("Примеры:");
  console.log("  node scripts/browse-db.mjs flow");
  console.log("  node scripts/browse-db.mjs users");
  console.log("  node scripts/browse-db.mjs orders 20");
  console.log("  node scripts/browse-db.mjs service_invoice_requests");
  process.exit(0);
}

if (tableArg === "flow") {
  printFlowHelp();
  process.exit(0);
}

if (!tables.includes(tableArg)) {
  console.error(`Таблица "${tableArg}" не найдена.`);
  console.error("Доступно:", tables.join(", "));
  process.exit(1);
}

if (TABLE_INFO[tableArg]) {
  console.log(TABLE_INFO[tableArg]);
  console.log("");
}

if (tableArg === "service_invoice_requests") {
  const statusCounts = await client.execute(
    `SELECT status, COUNT(*) AS count FROM service_invoice_requests GROUP BY status ORDER BY count DESC`,
  );
  console.log("По статусам:");
  for (const row of statusCounts.rows) {
    const status = String(Array.isArray(row) ? row[0] : row.status);
    const count = Array.isArray(row) ? row[1] : row.count;
    const hint = SERVICE_INVOICE_STATUSES[status] ? ` — ${SERVICE_INVOICE_STATUSES[status]}` : "";
    console.log(`  ${status}: ${count}${hint}`);
  }
  console.log("");
}

if (tableArg === "orders") {
  const methodCounts = await client.execute(
    `SELECT payment_method, COUNT(*) AS count FROM orders GROUP BY payment_method ORDER BY count DESC`,
  );
  console.log("По способу оплаты:");
  for (const row of methodCounts.rows) {
    const method = String(Array.isArray(row) ? row[0] : row.payment_method);
    const count = Array.isArray(row) ? row[1] : row.count;
    const note = method === "invoice" ? " (актуальный)" : " [legacy]";
    console.log(`  ${method}: ${count}${note}`);
  }
  console.log("");
  console.log("Статусы заказов:", Object.entries(ORDER_STATUSES).map(([k, v]) => `${k}=${v}`).join(", "));
  console.log("");
}

const columnsResult = await client.execute(`PRAGMA table_info(${tableArg})`);
if (columnsResult.rows.length) {
  console.log("Колонки:", columnsResult.rows.map((row) => String(Array.isArray(row) ? row[1] : row.name)).join(", "));
  console.log("");
}

const rowsResult = await client.execute(`SELECT * FROM ${tableArg} ORDER BY id DESC LIMIT ${limit}`);
const rows = rowsResult.rows.map((row) => {
  const mapped = {};
  for (let i = 0; i < rowsResult.columns.length; i += 1) {
    mapped[rowsResult.columns[i]] = Array.isArray(row) ? row[i] : row[rowsResult.columns[i]];
  }
  return maskSensitive(tableArg, mapped);
});

console.log(`${tableArg} (последние ${limit}):`);
printRows(rows);