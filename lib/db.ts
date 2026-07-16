import "server-only";

import { createClient, type Client, type InArgs, type Transaction } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
// pg does not ship declarations in this project; the small local interface below keeps its use typed.
// @ts-expect-error pg has no bundled TypeScript declarations.
import pg from "pg";
import { configuredAdminEmails } from "@/lib/site-config";

const isNextProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

function isRemoteTurso() {
  return resolveDatabaseUrl().startsWith("libsql://");
}

function resolveDatabaseUrl(): string {
  if (process.env.POSTGRES_URL) {
    return process.env.POSTGRES_URL;
  }

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
  skmPostgresPool?: PostgresPool;
  skmDbReady?: Promise<void>;
};

type QueryResult = {
  rows: unknown[];
  columns: string[];
  rowsAffected: number;
  lastInsertRowid?: number;
};

type PostgresQueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
  fields: Array<{ name: string }>;
};

type PostgresQueryable = {
  query(sql: string, args?: unknown[]): Promise<PostgresQueryResult>;
};

type PostgresClient = PostgresQueryable & {
  release(): void;
};

type PostgresPool = PostgresQueryable & {
  connect(): Promise<PostgresClient>;
};

type PostgresExecutor = {
  readonly kind: "postgres";
  query(sql: string, args?: unknown[]): Promise<PostgresQueryResult>;
  executeMultiple(sql: string): Promise<void>;
};

type DbExecutor = Client | Transaction | PostgresExecutor;
type DbTxExecutor = Transaction | PostgresExecutor;

type PostgresPoolOptions = {
  connectionString: string;
  ssl?: {
    rejectUnauthorized: boolean;
  };
};

const pgModule = pg as unknown as { Pool: new (options: PostgresPoolOptions) => PostgresPool };

function getPostgresPoolOptions(): PostgresPoolOptions {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not configured");
  }

  const options: PostgresPoolOptions = { connectionString: process.env.POSTGRES_URL };

  try {
    const url = new URL(process.env.POSTGRES_URL);
    const sslMode = url.searchParams.get("sslmode");
    const libpqCompat = url.searchParams.get("uselibpqcompat");
    const allowSelfSigned =
      process.env.POSTGRES_ALLOW_SELF_SIGNED_CERT === "true" ||
      libpqCompat === "true" ||
      sslMode === "require";

    if (allowSelfSigned) {
      url.searchParams.delete("sslmode");
      url.searchParams.delete("uselibpqcompat");
      options.connectionString = url.toString();
      options.ssl = { rejectUnauthorized: false };
    }
  } catch {
    // Keep pg's default parsing for non-standard connection strings.
  }

  return options;
}

function isPostgresExecutor(executor: DbExecutor): executor is PostgresExecutor {
  return "kind" in executor && executor.kind === "postgres";
}

function isIntegerString(value: string) {
  return /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

function normalizePostgresRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : typeof value === "string" && isIntegerString(value)
          ? Number(value)
          : value,
    ]),
  );
}

function mapPostgresResult(result: PostgresQueryResult): QueryResult {
  const rows = result.rows.map(normalizePostgresRow);
  const firstRow = rows[0] as Record<string, unknown> | undefined;
  const insertedId = firstRow?.id;

  return {
    rows,
    columns: result.fields.map((field) => field.name),
    rowsAffected: result.rowCount ?? 0,
    lastInsertRowid: typeof insertedId === "number" ? insertedId : undefined,
  };
}

function findDollarQuoteEnd(sql: string, start: number) {
  const match = sql.slice(start).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  if (!match) return -1;
  const tag = match[0];
  const end = sql.indexOf(tag, start + tag.length);
  return end < 0 ? sql.length - tag.length : end + tag.length;
}

function replaceQuestionMarks(sql: string) {
  let parameterIndex = 0;
  let result = "";
  let state: "normal" | "single" | "double" | "lineComment" | "blockComment" = "normal";

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (state === "single") {
      result += character;
      if (character === "'" && next === "'") {
        result += next;
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }

    if (state === "double") {
      result += character;
      if (character === '"' && next === '"') {
        result += next;
        index += 1;
      } else if (character === '"') {
        state = "normal";
      }
      continue;
    }

    if (state === "lineComment") {
      result += character;
      if (character === "\n") state = "normal";
      continue;
    }

    if (state === "blockComment") {
      result += character;
      if (character === "*" && next === "/") {
        result += next;
        index += 1;
        state = "normal";
      }
      continue;
    }

    if (character === "'" ) {
      state = "single";
      result += character;
    } else if (character === '"') {
      state = "double";
      result += character;
    } else if (character === "-" && next === "-") {
      state = "lineComment";
      result += character + next;
      index += 1;
    } else if (character === "/" && next === "*") {
      state = "blockComment";
      result += character + next;
      index += 1;
    } else if (character === "$") {
      const end = findDollarQuoteEnd(sql, index);
      if (end >= 0) {
        result += sql.slice(index, end);
        index = end - 1;
      } else {
        result += character;
      }
    } else if (character === "?") {
      parameterIndex += 1;
      result += `$${parameterIndex}`;
    } else {
      result += character;
    }
  }

  return result;
}

function findMatchingParenthesis(sql: string, openingIndex: number) {
  let depth = 0;
  let state: "normal" | "single" | "double" = "normal";

  for (let index = openingIndex; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    if (state === "single") {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") state = "normal";
      continue;
    }
    if (state === "double") {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') state = "normal";
      continue;
    }
    if (character === "'") state = "single";
    else if (character === '"') state = "double";
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function splitTopLevelArguments(value: string) {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let state: "normal" | "single" | "double" = "normal";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (state === "single") {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") state = "normal";
      continue;
    }
    if (state === "double") {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') state = "normal";
      continue;
    }
    if (character === "'") state = "single";
    else if (character === '"') state = "double";
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function replaceMultiArgumentMax(sql: string) {
  let result = sql;
  let searchFrom = 0;
  const maxPattern = /\bMAX\s*\(/gi;

  while (true) {
    maxPattern.lastIndex = searchFrom;
    const match = maxPattern.exec(result);
    if (!match) break;
    const openingIndex = result.indexOf("(", match.index);
    const closingIndex = findMatchingParenthesis(result, openingIndex);
    if (closingIndex < 0) break;

    const argumentsList = splitTopLevelArguments(result.slice(openingIndex + 1, closingIndex));
    if (argumentsList.length > 1) {
      result = `${result.slice(0, match.index)}GREATEST(${argumentsList.join(", ")})${result.slice(closingIndex + 1)}`;
      searchFrom = match.index + 10;
    } else {
      searchFrom = closingIndex + 1;
    }
  }

  return result;
}

function translateSqlForPostgres(sql: string) {
  const hasInsertOrIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);
  let translated = replaceQuestionMarks(sql)
    .replace(/datetime\s*\(\s*'now'\s*,\s*'-1 hour'\s*\)/gi, "CURRENT_TIMESTAMP - INTERVAL '1 hour'")
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");

  translated = replaceMultiArgumentMax(translated);

  if (hasInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(translated)) {
    const semicolon = translated.lastIndexOf(";");
    if (semicolon >= 0 && !translated.slice(semicolon + 1).trim()) {
      translated = `${translated.slice(0, semicolon)} ON CONFLICT DO NOTHING;${translated.slice(semicolon + 1)}`;
    } else if (/INSERT\s+INTO/i.test(translated)) {
      translated = `${translated.trimEnd()} ON CONFLICT DO NOTHING`;
    }
  }

  return translated;
}

async function executeWith(executor: DbExecutor, sql: string, args: InArgs = [], returnInsertedId = false) {
  if (isPostgresExecutor(executor)) {
    let translated = translateSqlForPostgres(sql);
    if (returnInsertedId && /^\s*INSERT\s/i.test(translated) && !/\bRETURNING\b/i.test(translated)) {
      const semicolon = translated.lastIndexOf(";");
      if (semicolon >= 0 && !translated.slice(semicolon + 1).trim()) {
        translated = `${translated.slice(0, semicolon).trimEnd()} RETURNING id;${translated.slice(semicolon + 1)}`;
      } else {
        translated = `${translated.trimEnd()} RETURNING id`;
      }
    }
    return mapPostgresResult(await executor.query(translated, args as unknown[]));
  }

  const result = await executor.execute({ sql, args });
  return {
    rows: result.rows,
    columns: result.columns,
    rowsAffected: result.rowsAffected ?? 0,
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
  };
}

function getPostgresPool() {
  if (!globalForDb.skmPostgresPool) {
    globalForDb.skmPostgresPool = new pgModule.Pool(getPostgresPoolOptions());
  }
  return globalForDb.skmPostgresPool;
}

function getPostgresExecutor(): PostgresExecutor {
  const pool = getPostgresPool();
  return {
    kind: "postgres",
    query: (sql, args) => pool.query(sql, args),
    executeMultiple: async (sql) => {
      await pool.query(translateSqlForPostgres(sql));
    },
  };
}

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
  const obj: Record<string, unknown> = {};

  if (Array.isArray(row)) {
    for (let i = 0; i < columns.length; i += 1) {
      obj[columns[i]] = row[i];
    }
  } else {
    const record = row as Record<string, unknown>;
    for (const column of columns) {
      obj[column] = record[column];
    }
  }

  return obj as T;
}

async function dbGetWith<T>(executor: DbExecutor, sql: string, args: InArgs = []): Promise<T | undefined> {
  const result = await executeWith(executor, sql, args);
  if (result.rows.length === 0) return undefined;
  return isPostgresExecutor(executor)
    ? (result.rows[0] as T)
    : mapRow<T>(result.columns, result.rows[0]);
}

async function dbAllWith<T>(executor: DbExecutor, sql: string, args: InArgs = []): Promise<T[]> {
  const result = await executeWith(executor, sql, args);
  return isPostgresExecutor(executor)
    ? (result.rows as T[])
    : result.rows.map((row) => mapRow<T>(result.columns, row));
}

async function dbRunWith(executor: DbExecutor, sql: string, args: InArgs = []) {
  const result = await executeWith(executor, sql, args, isPostgresExecutor(executor));
  return {
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    changes: result.rowsAffected,
  };
}

export async function dbGet<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  await ensureDb();
  return dbGetWith<T>(process.env.POSTGRES_URL ? getPostgresExecutor() : getClient(), sql, args);
}

export async function dbAll<T>(sql: string, args: InArgs = []): Promise<T[]> {
  await ensureDb();
  return dbAllWith<T>(process.env.POSTGRES_URL ? getPostgresExecutor() : getClient(), sql, args);
}

export async function dbRun(sql: string, args: InArgs = []) {
  await ensureDb();
  return dbRunWith(process.env.POSTGRES_URL ? getPostgresExecutor() : getClient(), sql, args);
}

export async function dbExec(sql: string) {
  await ensureDb();
  if (process.env.POSTGRES_URL) await getPostgresExecutor().executeMultiple(sql);
  else await getClient().executeMultiple(sql);
}

export async function dbBatch(statements: Array<{ sql: string; args?: InArgs }>) {
  await ensureDb();
  if (process.env.POSTGRES_URL) {
    await dbTransaction(async (tx) => {
      for (const statement of statements) await executeWith(tx, statement.sql, statement.args ?? []);
    });
    return;
  }
  await getClient().batch(
    statements.map((statement) => ({ sql: statement.sql, args: statement.args ?? [] })),
    "write",
  );
}

export async function dbTxGet<T>(tx: DbTxExecutor, sql: string, args: InArgs = []) {
  return dbGetWith<T>(tx, sql, args);
}

export async function dbTxAll<T>(tx: DbTxExecutor, sql: string, args: InArgs = []) {
  return dbAllWith<T>(tx, sql, args);
}

export async function dbTxRun(tx: DbTxExecutor, sql: string, args: InArgs = []) {
  return dbRunWith(tx, sql, args);
}

export async function dbTransaction<T>(fn: (tx: DbTxExecutor) => Promise<T>): Promise<T> {
  await ensureDb();
  if (process.env.POSTGRES_URL) {
    const client = await getPostgresPool().connect();
    const tx: PostgresExecutor = {
      kind: "postgres",
      query: (sql, args) => client.query(sql, args),
      executeMultiple: async (sql) => {
        await client.query(translateSqlForPostgres(sql));
      },
    };
    try {
      await client.query("BEGIN");
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

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
  service_slug TEXT NOT NULL DEFAULT '',
  service_title TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'invoice' CHECK(payment_method IN ('balance', 'card', 'invoice')),
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK(total_amount >= 0),
  paid_amount INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'in_discussion', 'price_agreed', 'in_progress', 'completed', 'paid', 'cancelled', 'created', 'awaiting_payment')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  type TEXT NOT NULL CHECK(type IN ('prepayment', 'remaining', 'full')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'paid', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoices_order_created ON invoices(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_order_created ON payments(order_id, created_at);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('balance_request', 'admin_adjustment', 'order_payment', 'card_payment_request', 'invoice_payment')),
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

CREATE TABLE IF NOT EXISTS chat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  page_url TEXT,
  page_title TEXT,
  service_slug TEXT,
  service_title TEXT,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  chat_id TEXT,
  source TEXT NOT NULL DEFAULT 'jivo',
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_events_created ON chat_events(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_events_event_created ON chat_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_events_user_created ON chat_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  price_unit TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  estimated_duration TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  gallery TEXT NOT NULL DEFAULT '[]',
  included TEXT NOT NULL DEFAULT '[]',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  seo_keywords TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_services_active_sort ON services(is_active, sort_order);
`;

const postgresSchemaSql = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    admin_panel_password TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS otp_codes (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS services (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    short_description TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price BIGINT NOT NULL DEFAULT 0,
    price_unit TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    estimated_duration TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    gallery TEXT NOT NULL DEFAULT '[]',
    included TEXT NOT NULL DEFAULT '[]',
    seo_title TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    seo_keywords TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_slug TEXT NOT NULL DEFAULT '',
    service_title TEXT NOT NULL DEFAULT '',
    amount BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'invoice' CHECK (payment_method IN ('balance', 'card', 'invoice')),
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    total_amount BIGINT NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_discussion', 'price_agreed', 'in_progress', 'completed', 'paid', 'cancelled', 'created', 'awaiting_payment')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    type TEXT NOT NULL CHECK (type IN ('prepayment', 'remaining', 'full')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'paid', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    confirmed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('balance_request', 'admin_adjustment', 'order_payment', 'card_payment_request', 'invoice_payment')),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS balance_topup_requests (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'rejected')),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS topup_requests (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_amount BIGINT NOT NULL CHECK (requested_amount > 0),
    invoice_amount BIGINT CHECK (invoice_amount IS NULL OR invoice_amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'invoice_sent', 'paid', 'completed')),
    user_comment TEXT,
    admin_comment TEXT,
    processed_by_email TEXT,
    invoice_sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS service_invoice_requests (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_slug TEXT NOT NULL,
    service_title TEXT NOT NULL,
    requested_amount BIGINT NOT NULL CHECK (requested_amount > 0),
    invoice_amount BIGINT CHECK (invoice_amount IS NULL OR invoice_amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'invoice_sent', 'paid', 'completed')),
    user_comment TEXT,
    admin_comment TEXT,
    processed_by_email TEXT,
    invoice_sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS contact_requests (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT,
    phone TEXT NOT NULL,
    comment TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'processed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS chat_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_name TEXT NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    visitor_name TEXT,
    visitor_email TEXT,
    visitor_phone TEXT,
    page_url TEXT,
    page_title TEXT,
    service_slug TEXT,
    service_title TEXT,
    order_id BIGINT,
    chat_id TEXT,
    source TEXT NOT NULL DEFAULT 'jivo',
    payload TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_panel_password TEXT",
  "CREATE INDEX IF NOT EXISTS idx_otp_email_created ON otp_codes(email, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_invoices_order_created ON invoices(order_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_payments_order_created ON payments(order_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_topup_requests_user_created ON balance_topup_requests(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_topup_requests_new_user_created ON topup_requests(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_topup_requests_status_created ON topup_requests(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_service_invoice_requests_user_created ON service_invoice_requests(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_service_invoice_requests_status_created ON service_invoice_requests(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_contact_requests_status_created ON contact_requests(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_chat_events_created ON chat_events(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_chat_events_event_created ON chat_events(event_name, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_chat_events_user_created ON chat_events(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_services_active_sort ON services(is_active, sort_order)",
] as const;

async function runPostgresMigrations() {
  const client = await getPostgresPool().connect();
  const executor: PostgresExecutor = {
    kind: "postgres",
    query: (sql, args) => client.query(sql, args),
    executeMultiple: async (sql) => {
      await client.query(translateSqlForPostgres(sql));
    },
  };

  try {
    await client.query("BEGIN");
    for (const statement of postgresSchemaSql) await executor.query(statement);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const sqliteRebuildTableNames = {
  orders: "orders",
  transactions: "transactions",
} as const;

const sqliteLegacyTableNames = {
  orders: "orders_legacy",
  transactions: "transactions_legacy",
} as const;

async function rebuildTableIfNeeded(
  table: "orders" | "transactions",
  requiredSqlFragment: string,
  expectedSql: string,
  copySql: string,
) {
  const tableName = sqliteRebuildTableNames[table];
  const legacyTableName = sqliteLegacyTableNames[table];
  const row = await dbGetWith<{ sql: string }>(
    getClient(),
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  );

  if (!row) return;
  if (row.sql.includes(requiredSqlFragment)) return;

  const tx = await getClient().transaction("write");
  try {
    await tx.execute(`ALTER TABLE ${tableName} RENAME TO ${legacyTableName}`);
    await tx.executeMultiple(expectedSql);
    await tx.execute(copySql);
    await tx.execute(`DROP TABLE ${legacyTableName}`);
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

async function rebuildOrdersTableForOrderManagement() {
  const row = await dbGetWith<{ sql: string }>(
    getClient(),
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'",
  );

  if (!row || (row.sql.includes("total_amount") && row.sql.includes("'in_discussion'"))) return;

  const columns = await dbAllWith<{ name: string }>(getClient(), "PRAGMA table_info(orders)");
  const hasColumn = (name: string) => columns.some((column) => column.name === name);
  const pick = (name: string, fallback: string) => (hasColumn(name) ? name : fallback);

  const titleExpr = hasColumn("title")
    ? `COALESCE(NULLIF(title, ''), NULLIF(${pick("service_title", "''")}, ''), 'Заказ')`
    : `COALESCE(NULLIF(${pick("service_title", "''")}, ''), 'Заказ')`;
  const descriptionExpr = hasColumn("description")
    ? `COALESCE(description, '')`
    : `COALESCE(NULLIF(${pick("service_title", "''")}, ''), '')`;
  const amountExpr = pick("amount", "0");
  const totalAmountExpr = hasColumn("total_amount")
    ? `COALESCE(total_amount, ${amountExpr}, 0)`
    : `COALESCE(${amountExpr}, 0)`;
  const paidAmountExpr = hasColumn("paid_amount")
    ? "COALESCE(paid_amount, 0)"
    : `CASE WHEN ${pick("status", "''")} = 'paid' THEN COALESCE(${amountExpr}, 0) ELSE 0 END`;

  const tx = await getClient().transaction("write");
  try {
    await tx.execute("ALTER TABLE orders RENAME TO orders_legacy");
    await tx.executeMultiple(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_slug TEXT NOT NULL DEFAULT '',
        service_title TEXT NOT NULL DEFAULT '',
        amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
        payment_method TEXT NOT NULL DEFAULT 'invoice' CHECK(payment_method IN ('balance', 'card', 'invoice')),
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        total_amount INTEGER NOT NULL DEFAULT 0 CHECK(total_amount >= 0),
        paid_amount INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'in_discussion', 'price_agreed', 'in_progress', 'completed', 'paid', 'cancelled', 'created', 'awaiting_payment')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
    `);
    await tx.execute(`
      INSERT INTO orders (
        id, user_id, service_slug, service_title, amount, payment_method,
        title, description, total_amount, paid_amount, status, created_at, updated_at
      )
      SELECT
        id,
        user_id,
        COALESCE(${pick("service_slug", "''")}, ''),
        COALESCE(${pick("service_title", "''")}, ''),
        COALESCE(${amountExpr}, 0),
        COALESCE(${pick("payment_method", "'invoice'")}, 'invoice'),
        ${titleExpr},
        ${descriptionExpr},
        ${totalAmountExpr},
        ${paidAmountExpr},
        COALESCE(${pick("status", "'new'")}, 'new'),
        COALESCE(${pick("created_at", "CURRENT_TIMESTAMP")}, CURRENT_TIMESTAMP),
        COALESCE(${pick("updated_at", pick("created_at", "CURRENT_TIMESTAMP"))}, CURRENT_TIMESTAMP)
      FROM orders_legacy
    `);
    await tx.execute("DROP TABLE orders_legacy");
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

async function rebuildServiceInvoiceRequestsForeignKey() {
  const row = await dbGetWith<{ sql: string }>(
    getClient(),
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'service_invoice_requests'",
  );

  if (!row?.sql.includes("orders_legacy")) return;

  const tx = await getClient().transaction("write");
  try {
    await tx.execute("DROP INDEX IF EXISTS idx_service_invoice_requests_user_created");
    await tx.execute("DROP INDEX IF EXISTS idx_service_invoice_requests_status_created");
    await tx.execute("ALTER TABLE service_invoice_requests RENAME TO service_invoice_requests_legacy");
    await tx.executeMultiple(`
      CREATE TABLE service_invoice_requests (
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
    `);
    await tx.execute(`
      INSERT INTO service_invoice_requests (
        id, user_id, order_id, service_slug, service_title, requested_amount, invoice_amount,
        status, user_comment, admin_comment, processed_by_email, invoice_sent_at, paid_at,
        completed_at, created_at, updated_at
      )
      SELECT
        id, user_id, order_id, service_slug, service_title, requested_amount, invoice_amount,
        status, user_comment, admin_comment, processed_by_email, invoice_sent_at, paid_at,
        completed_at, created_at, updated_at
      FROM service_invoice_requests_legacy
      WHERE EXISTS (SELECT 1 FROM users WHERE users.id = service_invoice_requests_legacy.user_id)
        AND EXISTS (SELECT 1 FROM orders WHERE orders.id = service_invoice_requests_legacy.order_id)
    `);
    await tx.execute("DROP TABLE service_invoice_requests_legacy");
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

async function rebuildInvoicesForeignKey() {
  const row = await dbGetWith<{ sql: string }>(
    getClient(),
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'invoices'",
  );

  if (!row?.sql.includes("orders_legacy")) return;

  const tx = await getClient().transaction("write");
  try {
    await tx.execute("DROP INDEX IF EXISTS idx_invoices_order_created");
    await tx.execute("DROP INDEX IF EXISTS idx_invoices_status_created");
    await tx.execute("ALTER TABLE invoices RENAME TO invoices_legacy");
    await tx.executeMultiple(`
      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL CHECK(amount > 0),
        type TEXT NOT NULL CHECK(type IN ('prepayment', 'remaining', 'full')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'paid', 'cancelled')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_order_created ON invoices(order_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at);
    `);
    await tx.execute(`
      INSERT INTO invoices (id, order_id, amount, type, status, created_at)
      SELECT id, order_id, amount, type, status, created_at
      FROM invoices_legacy
      WHERE EXISTS (SELECT 1 FROM orders WHERE orders.id = invoices_legacy.order_id)
    `);
    await tx.execute("DROP TABLE invoices_legacy");
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

async function rebuildPaymentsForeignKey() {
  const row = await dbGetWith<{ sql: string }>(
    getClient(),
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payments'",
  );

  if (!row?.sql.includes("orders_legacy")) return;

  const tx = await getClient().transaction("write");
  try {
    await tx.execute("DROP INDEX IF EXISTS idx_payments_order_created");
    await tx.execute("ALTER TABLE payments RENAME TO payments_legacy");
    await tx.executeMultiple(`
      CREATE TABLE payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        amount INTEGER NOT NULL CHECK(amount > 0),
        confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_payments_order_created ON payments(order_id, created_at);
    `);
    await tx.execute(`
      INSERT INTO payments (id, order_id, invoice_id, amount, confirmed_by, created_at)
      SELECT
        id,
        order_id,
        CASE
          WHEN invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM invoices WHERE invoices.id = payments_legacy.invoice_id)
            THEN invoice_id
          ELSE NULL
        END,
        amount,
        CASE
          WHEN confirmed_by IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE users.id = payments_legacy.confirmed_by)
            THEN confirmed_by
          ELSE NULL
        END,
        created_at
      FROM payments_legacy
      WHERE EXISTS (SELECT 1 FROM orders WHERE orders.id = payments_legacy.order_id)
    `);
    await tx.execute("DROP TABLE payments_legacy");
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

async function repairOrderChildForeignKeys() {
  await rebuildInvoicesForeignKey();
  await rebuildPaymentsForeignKey();
  await rebuildServiceInvoiceRequestsForeignKey();
}

/**
 * Однократно наполняет таблицу services стартовым каталогом из lib/services.ts.
 * Выполняется только если таблица полностью пуста, чтобы не затирать правки админа.
 */
async function seedServicesIfEmpty() {
  const client = getClient();
  const countRow = await dbGetWith<{ total: number }>(client, "SELECT COUNT(*) AS total FROM services");
  if (Number(countRow?.total ?? 0) > 0) return;

  const { services } = await import("@/lib/services");
  for (const service of services) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO services
        (slug, title, short_description, description, price, price_unit, category, estimated_duration, image, gallery, included, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        service.slug,
        service.title,
        service.shortDescription,
        service.description,
        service.price,
        "",
        service.category,
        service.estimatedDuration,
        service.image,
        "[]",
        JSON.stringify(service.included),
        service.id,
      ],
    });
  }
}

/** PNG-фото услуг заменены на лёгкие WebP — правим пути в уже сидированных строках. */
async function migrateServiceImagesToWebp(client: ReturnType<typeof getClient>) {
  await client.execute(
    "UPDATE services SET image = REPLACE(image, '.png', '.webp') WHERE image LIKE '/services/%.png'",
  );
}

async function runMigrations() {
  if (process.env.POSTGRES_URL) {
    await runPostgresMigrations();
    return;
  }

  const client = getClient();

  // Быстрый путь для удалённой Turso: если схема уже актуальна (есть таблица
  // services — последняя миграция), пропускаем ~20 сетевых
  // раундтрипов миграций на каждом холодном старте serverless-функции.
  if (isRemoteTurso()) {
    const result = await client.execute(
      "SELECT COUNT(*) AS ready FROM sqlite_master WHERE type = 'table' AND name = 'services'",
    );
    const row = result.rows[0] as unknown;
    const ready = Array.isArray(row) ? row[0] : (row as { ready?: number } | undefined)?.ready;
    if (Number(ready) > 0) {
      await migrateServiceImagesToWebp(client);
      return;
    }
  }

  await client.executeMultiple(schemaSql);
  await rebuildOrdersTableForOrderManagement();
  await repairOrderChildForeignKeys();
  await seedServicesIfEmpty();
  await migrateServiceImagesToWebp(client);

  const userColumns = await dbAllWith<{ name: string }>(client, "PRAGMA table_info(users)");
  if (!userColumns.some((column) => column.name === "admin_panel_password")) {
    await client.execute("ALTER TABLE users ADD COLUMN admin_panel_password TEXT");
  }

  // На Turso схема уже поднимается отдельным скриптом; legacy-миграции SQLite здесь зависают.
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
  title: string;
  description: string;
  total_amount: number;
  paid_amount: number;
  status: "new" | "in_discussion" | "price_agreed" | "in_progress" | "completed" | "paid" | "cancelled" | "created" | "awaiting_payment";
  created_at: string;
  updated_at: string;
};

export type DbInvoice = {
  id: number;
  order_id: number;
  amount: number;
  type: "prepayment" | "remaining" | "full";
  status: "pending" | "sent" | "paid" | "cancelled";
  created_at: string;
};

export type DbPayment = {
  id: number;
  order_id: number;
  invoice_id: number | null;
  amount: number;
  confirmed_by: number | null;
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

export type DbChatEvent = {
  id: number;
  event_name: string;
  user_id: number | null;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  page_url: string | null;
  page_title: string | null;
  service_slug: string | null;
  service_title: string | null;
  order_id: number | null;
  chat_id: string | null;
  source: string;
  payload: string | null;
  created_at: string;
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
