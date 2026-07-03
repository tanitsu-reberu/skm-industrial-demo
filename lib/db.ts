import "server-only";

import { createClient, type Client, type InArgs, type Transaction } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { configuredAdminEmails } from "@/lib/site-config";

const isNextProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

function isRemoteTurso() {
  return resolveDatabaseUrl().startsWith("libsql://");
}

function resolveDatabaseUrl(): string {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }

  const dataDir = process.env.VERCEL
    ? path.join("/tmp", "skm-data")
    : path.join(process.cwd(), "data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return `file:${path.join(dataDir, "skm.sqlite")}`;
}

const globalForDb = globalThis as unknown as {
  skmLibsql?: Client;
  skmDbReady?: Promise<void>;
};

function getClient(): Client {
  if (!globalForDb.skmLibsql) {
    const url =
      isNextProductionBuild && !process.env.TURSO_DATABASE_URL
        ? ":memory:"
        : resolveDatabaseUrl();

    globalForDb.skmLibsql = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }

  return globalForDb.skmLibsql;
}

function mapRow<T>(columns: string[], row: unknown): T {
  if (Array.isArray(row)) {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i += 1) {
      obj[columns[i]] = row[i];
    }
    return obj as T;
  }

  return row as T;
}

type DbExecutor = Pick<Client, "execute" | "batch" | "executeMultiple"> | Transaction;

async function dbGetWith<T>(executor: DbExecutor, sql: string, args: InArgs = []): Promise<T | undefined> {
  const result = await executor.execute({ sql, args });
  if (result.rows.length === 0) return undefined;
  return mapRow<T>(result.columns, result.rows[0]);
}

async function dbAllWith<T>(executor: DbExecutor, sql: string, args: InArgs = []): Promise<T[]> {
  const result = await executor.execute({ sql, args });
  return result.rows.map((row) => mapRow<T>(result.columns, row));
}

async function dbRunWith(executor: DbExecutor, sql: string, args: InArgs = []) {
  const result = await executor.execute({ sql, args });
  return {
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    changes: result.rowsAffected,
  };
}

export async function dbGet<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  await ensureDb();
  return dbGetWith<T>(getClient(), sql, args);
}

export async function dbAll<T>(sql: string, args: InArgs = []): Promise<T[]> {
  await ensureDb();
  return dbAllWith<T>(getClient(), sql, args);
}

export async function dbRun(sql: string, args: InArgs = []) {
  await ensureDb();
  return dbRunWith(getClient(), sql, args);
}

export async function dbExec(sql: string) {
  await ensureDb();
  await getClient().executeMultiple(sql);
}

export async function dbBatch(statements: Array<{ sql: string; args?: InArgs }>) {
  await ensureDb();
  await getClient().batch(
    statements.map((statement) => ({
      sql: statement.sql,
      args: statement.args ?? [],
    })),
    "write",
  );
}

export async function dbTxGet<T>(tx: Transaction, sql: string, args: InArgs = []) {
  return dbGetWith<T>(tx, sql, args);
}

export async function dbTxAll<T>(tx: Transaction, sql: string, args: InArgs = []) {
  return dbAllWith<T>(tx, sql, args);
}

export async function dbTxRun(tx: Transaction, sql: string, args: InArgs = []) {
  return dbRunWith(tx, sql, args);
}

export async function dbTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  await ensureDb();
  const tx = await getClient().transaction("write");

  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_email_created ON otp_codes(email, created_at);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_slug TEXT NOT NULL,
  service_title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('balance', 'card')),
  status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created', 'paid', 'awaiting_payment', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('balance_request', 'admin_adjustment', 'order_payment', 'card_payment_request')),
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at);

CREATE TABLE IF NOT EXISTS balance_topup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'approved', 'rejected')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_topup_requests_user_created ON balance_topup_requests(user_id, created_at);

CREATE TABLE IF NOT EXISTS topup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_amount INTEGER NOT NULL CHECK(requested_amount > 0),
  invoice_amount INTEGER CHECK(invoice_amount IS NULL OR invoice_amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'invoice_sent', 'paid', 'completed')),
  user_comment TEXT,
  admin_comment TEXT,
  processed_by_email TEXT,
  invoice_sent_at TEXT,
  paid_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_topup_requests_new_user_created ON topup_requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_topup_requests_status_created ON topup_requests(status, created_at);

CREATE TABLE IF NOT EXISTS service_invoice_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_slug TEXT NOT NULL,
  service_title TEXT NOT NULL,
  requested_amount INTEGER NOT NULL CHECK(requested_amount > 0),
  invoice_amount INTEGER CHECK(invoice_amount IS NULL OR invoice_amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'invoice_sent', 'paid', 'completed')),
  user_comment TEXT,
  admin_comment TEXT,
  processed_by_email TEXT,
  invoice_sent_at TEXT,
  paid_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_invoice_requests_user_created ON service_invoice_requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_service_invoice_requests_status_created ON service_invoice_requests(status, created_at);

CREATE TABLE IF NOT EXISTS contact_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT NOT NULL,
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'processed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_status_created ON contact_requests(status, created_at);
`;

async function rebuildTableIfNeeded(
  table: "orders" | "transactions",
  requiredSqlFragment: string,
  expectedSql: string,
  copySql: string,
) {
  const row = await dbGetWith<{ sql: string }>(
    getClient(),
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  );

  if (!row) return;
  if (row.sql.includes(requiredSqlFragment)) return;

  await dbTransaction(async (tx) => {
    await tx.execute(`ALTER TABLE ${table} RENAME TO ${table}_legacy`);
    await tx.executeMultiple(expectedSql);
    await tx.execute(copySql);
    await tx.execute(`DROP TABLE ${table}_legacy`);
  });
}

async function runMigrations() {
  const client = getClient();
  await client.executeMultiple(schemaSql);

  const userColumns = await dbAllWith<{ name: string }>(client, "PRAGMA table_info(users)");
  if (!userColumns.some((column) => column.name === "admin_panel_password")) {
    await client.execute("ALTER TABLE users ADD COLUMN admin_panel_password TEXT");
  }

  // На Turso схема уже поднимается отдельным скриптом; legacy-миграции SQLite здесь зависают.
  if (isRemoteTurso()) {
    return;
  }

  await client.executeMultiple(`
INSERT OR IGNORE INTO topup_requests (id, user_id, requested_amount, invoice_amount, status, user_comment, created_at, updated_at, completed_at)
SELECT
  id,
  user_id,
  amount,
  CASE WHEN status = 'approved' THEN amount ELSE NULL END,
  CASE WHEN status = 'approved' THEN 'completed' ELSE 'pending' END,
  comment,
  created_at,
  created_at,
  CASE WHEN status = 'approved' THEN created_at ELSE NULL END
FROM balance_topup_requests;
`);

  await rebuildTableIfNeeded(
    "orders",
    "'invoice'",
    `CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_slug TEXT NOT NULL,
      service_title TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount >= 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('balance', 'card', 'invoice')),
      status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created', 'paid', 'awaiting_payment', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);`,
    `INSERT INTO orders (id, user_id, service_slug, service_title, amount, payment_method, status, created_at)
     SELECT id, user_id, service_slug, service_title, amount, payment_method,
       CASE WHEN status = 'card_demo' THEN 'awaiting_payment' ELSE status END,
       created_at
     FROM orders_legacy;`,
  );

  await rebuildTableIfNeeded(
    "transactions",
    "'invoice_payment'",
    `CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('balance_request', 'admin_adjustment', 'order_payment', 'card_payment_request', 'invoice_payment')),
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at);`,
    `INSERT INTO transactions (id, user_id, amount, type, description, created_at)
     SELECT id, user_id, amount,
       CASE
         WHEN type IN ('top_up', 'admin_top_up') THEN 'admin_adjustment'
         WHEN type = 'card_payment_demo' THEN 'card_payment_request'
         ELSE type
       END,
       description,
       created_at
     FROM transactions_legacy;`,
  );
}

export async function ensureDb() {
  if (!globalForDb.skmDbReady) {
    globalForDb.skmDbReady = runMigrations();
  }

  await globalForDb.skmDbReady;
}

export type DbUser = {
  id: number;
  email: string;
  role: "user" | "admin";
  balance: number;
  admin_panel_password: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicDbUser = Omit<DbUser, "admin_panel_password">;

export type DbOrder = {
  id: number;
  user_id: number;
  service_slug: string;
  service_title: string;
  amount: number;
  payment_method: "balance" | "card" | "invoice";
  status: "created" | "paid" | "awaiting_payment" | "cancelled";
  created_at: string;
};

export type DbTransaction = {
  id: number;
  user_id: number;
  amount: number;
  type: "balance_request" | "admin_adjustment" | "order_payment" | "card_payment_request" | "invoice_payment";
  description: string;
  created_at: string;
};

export type DbTopupRequest = {
  id: number;
  user_id: number;
  requested_amount: number;
  invoice_amount: number | null;
  status: "pending" | "processing" | "invoice_sent" | "paid" | "completed";
  user_comment: string | null;
  admin_comment: string | null;
  processed_by_email: string | null;
  invoice_sent_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DbContactRequest = {
  id: number;
  name: string | null;
  phone: string;
  comment: string;
  status: "new" | "in_progress" | "processed";
  created_at: string;
  updated_at: string;
};

export type DbServiceInvoiceRequest = {
  id: number;
  user_id: number;
  order_id: number;
  service_slug: string;
  service_title: string;
  requested_amount: number;
  invoice_amount: number | null;
  status: "pending" | "processing" | "invoice_sent" | "paid" | "completed";
  user_comment: string | null;
  admin_comment: string | null;
  processed_by_email: string | null;
  invoice_sent_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isAdminEmail(email: string) {
  return configuredAdminEmails().includes(email.toLowerCase());
}

export function toPublicUser(user: DbUser): PublicDbUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    balance: user.balance,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export async function getAdminPanelPasswordHash(userId: number) {
  const row = await dbGet<{ admin_panel_password: string | null }>(
    "SELECT admin_panel_password FROM users WHERE id = ?",
    [userId],
  );
  return row?.admin_panel_password ?? null;
}

export async function hasAdminPanelPassword(userId: number) {
  return Boolean(await getAdminPanelPasswordHash(userId));
}

export async function setAdminPanelPassword(userId: number, passwordHash: string) {
  await dbRun(
    `UPDATE users
     SET admin_panel_password = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND role = 'admin'`,
    [passwordHash, userId],
  );
}

export async function upsertUserByEmail(email: string) {
  const role = isAdminEmail(email) ? "admin" : "user";
  await dbRun(
    `INSERT INTO users (email, role)
     VALUES (?, ?)
     ON CONFLICT(email) DO UPDATE SET
       role = excluded.role,
       updated_at = CURRENT_TIMESTAMP`,
    [email, role],
  );

  return (await dbGet<DbUser>("SELECT * FROM users WHERE email = ?", [email]))!;
}

export async function getUserById(id: number) {
  return dbGet<DbUser>("SELECT * FROM users WHERE id = ?", [id]);
}

export async function getUserByEmail(email: string) {
  return dbGet<DbUser>("SELECT * FROM users WHERE email = ?", [email]);
}