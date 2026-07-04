/**
 * Просмотр базы без Turso CLI.
 * Usage:
 *   node scripts/browse-db.mjs
 *   node scripts/browse-db.mjs users
 *   node scripts/browse-db.mjs orders 10
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

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

if (!tableArg) {
  console.log("Таблицы:");
  for (const table of tables) {
    const countResult = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
    const count = countResult.rows[0]?.[0] ?? countResult.rows[0]?.count ?? 0;
    console.log(`- ${table}: ${count}`);
  }
  console.log("");
  console.log("Примеры:");
  console.log("  node scripts/browse-db.mjs users");
  console.log("  node scripts/browse-db.mjs orders 20");
  process.exit(0);
}

if (!tables.includes(tableArg)) {
  console.error(`Таблица "${tableArg}" не найдена.`);
  console.error("Доступно:", tables.join(", "));
  process.exit(1);
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