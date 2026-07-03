import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const localDbPath = path.join(process.cwd(), "data", "skm.sqlite");
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running this script.");
  process.exit(1);
}

if (!fs.existsSync(localDbPath)) {
  console.error(`Local database not found: ${localDbPath}`);
  process.exit(1);
}

const tables = [
  "users",
  "otp_codes",
  "orders",
  "transactions",
  "balance_topup_requests",
  "topup_requests",
  "service_invoice_requests",
  "contact_requests",
];

const localDb = new Database(localDbPath, { readonly: true });
const remoteDb = createClient({ url: tursoUrl, authToken: tursoToken });

async function copyTable(table) {
  const columns = localDb.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  if (columns.length === 0) {
    console.log(`Skip ${table}: table not found locally`);
    return;
  }

  const rows = localDb.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`Skip ${table}: no rows`);
    return;
  }

  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

  for (const row of rows) {
    const args = columns.map((column) => row[column]);
    await remoteDb.execute({ sql, args });
  }

  console.log(`Copied ${rows.length} rows into ${table}`);
}

for (const table of tables) {
  await copyTable(table);
}

console.log("Local SQLite data pushed to Turso.");