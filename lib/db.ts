import "server-only";

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_EMAIL } from "@/lib/constants";

const dataDir = process.env.VERCEL
  ? path.join("/tmp", "skm-data")
  : path.join(process.cwd(), "data");
const isNextProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
const dbPath = isNextProductionBuild ? ":memory:" : path.join(dataDir, "skm.sqlite");

if (!isNextProductionBuild && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const globalForDb = globalThis as unknown as {
  skmDb?: Database.Database;
};

export const db =
  globalForDb.skmDb ??
  new Database(dbPath, {
    fileMustExist: false,
    timeout: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.skmDb = db;
}

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// SQLite MVP storage:
// users keeps login email, role, balance and timestamps;
// orders keeps service purchases;
// transactions is the audit trail for balance changes and payments;
// topup_requests keeps the admin-managed balance top-up workflow;
// service_invoice_requests keeps service orders paid by issued invoice;
// contact_requests keeps public callback/service requests from the website.
db.exec(`
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
`);

db.exec(`
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

function rebuildTableIfNeeded(table: "orders" | "transactions", requiredSqlFragment: string, expectedSql: string, copySql: string) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as
    | { sql: string }
    | undefined;

  if (!row) return;
  if (row.sql.includes(requiredSqlFragment)) return;

  db.transaction(() => {
    db.prepare(`ALTER TABLE ${table} RENAME TO ${table}_legacy`).run();
    db.exec(expectedSql);
    db.exec(copySql);
    db.prepare(`DROP TABLE ${table}_legacy`).run();
  })();
}

rebuildTableIfNeeded(
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

rebuildTableIfNeeded(
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

export type DbUser = {
  id: number;
  email: string;
  role: "user" | "admin";
  balance: number;
  created_at: string;
  updated_at: string;
};

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
  return email.toLowerCase() === ADMIN_EMAIL;
}

export function upsertUserByEmail(email: string) {
  const role = isAdminEmail(email) ? "admin" : "user";
  db.prepare(
    `INSERT INTO users (email, role)
     VALUES (@email, @role)
     ON CONFLICT(email) DO UPDATE SET
       role = excluded.role,
       updated_at = CURRENT_TIMESTAMP`,
  ).run({ email, role });

  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as DbUser;
}

export function getUserById(id: number) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function getUserByEmail(email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as DbUser | undefined;
}
