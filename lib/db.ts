import "server-only";

import { createClient, type Client, type InArgs, type Transaction } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { applyMigrations, setTransactionTimeouts } from "@/scripts/db-migrations.mjs";
// pg does not ship declarations in this project; the small local interface below keeps its use typed.
// @ts-expect-error pg has no bundled TypeScript declarations.
import pg from "pg";
import { configuredAdminEmail } from "@/lib/site-config";

const isNextProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

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
  fields: Array<{ name: string; dataTypeID: number }>;
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
  connectionString?: string;
  connectionTimeoutMillis?: number;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: {
    rejectUnauthorized: boolean;
    ca?: string;
  };
};

const pgModule = pg as unknown as { Pool: new (options: PostgresPoolOptions) => PostgresPool };

function safeDecodeUriComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parsePostgresUrlPassword(value: string) {
  const match = value.match(/^postgres(?:ql)?:\/\/[^:]+:(.+)@[^/@]+\/[^?]+/i);
  return match?.[1] ? safeDecodeUriComponent(match[1]) : undefined;
}

function getPostgresPoolOptions(): PostgresPoolOptions {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not configured");
  }

  const url = new URL(process.env.POSTGRES_URL);
  const options: PostgresPoolOptions = {
    connectionString: process.env.POSTGRES_URL,
    connectionTimeoutMillis: 5_000,
  };
  if (!url.hostname && url.searchParams.get("host")?.startsWith("/")) {
    // Let pg parse the local socket directory and peer-authenticated user.
    return options;
  }

  options.connectionString = undefined;
  options.host = url.hostname.replace(/^\[|\]$/g, "");
  options.port = url.port ? Number(url.port) : undefined;
  options.database = safeDecodeUriComponent(url.pathname.replace(/^\//, ""));
  options.user = safeDecodeUriComponent(url.username);
  options.password =
    parsePostgresUrlPassword(process.env.POSTGRES_URL) ??
    (url.password ? safeDecodeUriComponent(url.password) : undefined);

  const local = ["localhost", "127.0.0.1", "::1"].includes(options.host);
  if (!(local && url.searchParams.get("sslmode") === "disable")) {
    const caFile = process.env.POSTGRES_TLS_CA_FILE;
    options.ssl = { rejectUnauthorized: true, ca: caFile ? fs.readFileSync(caFile, "utf8") : undefined };
  }
  return options;
}

function isPostgresExecutor(executor: DbExecutor): executor is PostgresExecutor {
  return "kind" in executor && executor.kind === "postgres";
}

function isIntegerString(value: string) {
  return /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

function normalizePostgresRow(row: Record<string, unknown>, bigintColumns: Set<string>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : bigintColumns.has(key) && typeof value === "string" && isIntegerString(value)
          ? Number(value)
          : value,
    ]),
  );
}

function mapPostgresResult(result: PostgresQueryResult): QueryResult {
  const bigintColumns = new Set(result.fields.filter(field => field.dataTypeID === 20).map(field => field.name));
  const rows = result.rows.map(row => normalizePostgresRow(row, bigintColumns));
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
  `CREATE TABLE IF NOT EXISTS contact_requests (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT,
    phone TEXT NOT NULL,
    comment TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'processed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_panel_password TEXT",
  "CREATE INDEX IF NOT EXISTS idx_otp_email_created ON otp_codes(email, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_contact_requests_status_created ON contact_requests(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_services_active_sort ON services(is_active, sort_order)",
];

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
    await setTransactionTimeouts(client);
    await client.query("SELECT pg_advisory_xact_lock(57065006)");
    const servicesTable = await client.query("SELECT to_regclass('public.services') AS table_name");
    const servicesWereAbsent = !servicesTable.rows[0]?.table_name;
    for (const statement of postgresSchemaSql) await executor.query(statement);
    await migrateOtpSchema(executor);
    if (servicesWereAbsent) await seedServicesIfEmpty(executor);
    await migrateAdminConsentSchema(executor);
    await migrateContactConsentSchema(executor);
    await migrateCleaningService(executor);
    await applyMigrations(client, { inTransaction: true, sourceUTCVerified: process.env.SKM_CONSENT_SOURCE_UTC_VERIFIED === "1" });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Однократно наполняет таблицу services стартовым каталогом из lib/services.ts.
 * Выполняется только если таблица полностью пуста, чтобы не затирать правки админа.
 */
async function seedServicesIfEmpty(executor: DbExecutor) {
  const countRow = await dbGetWith<{ total: number }>(executor, "SELECT COUNT(*) AS total FROM services");
  if (Number(countRow?.total ?? 0) > 0) return;

  const { services } = await import("@/lib/services");
  for (const service of services) {
    await dbRunWith(
      executor,
      `INSERT INTO services
        (slug, title, short_description, description, price, price_unit, category, estimated_duration, image, gallery, included, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (slug) DO NOTHING`,
      [
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
    );
  }
}

/** PNG-фото услуг заменены на лёгкие WebP — правим пути в уже сидированных строках. */
async function migrateServiceImagesToWebp(client: ReturnType<typeof getClient>) {
  await client.execute(
    "UPDATE services SET image = REPLACE(image, '.png', '.webp') WHERE image LIKE '/services/%.png'",
  );
}

async function migrateContactConsentSchema(executor: DbExecutor) {
  const timestampType = isPostgresExecutor(executor) ? "TIMESTAMPTZ" : "TEXT";
  const columns = [
    ["email", "TEXT"],
    ["consent_version", "TEXT"],
    ["consented_at", timestampType],
    ["mail_next_attempt_at", timestampType],
    ["mail_sent_at", timestampType],
  ];
  if (isPostgresExecutor(executor)) {
    for (const [name, type] of columns) {
      await executor.query(`ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    }
  } else {
    const existing = await dbAllWith<{ name: string }>(executor, "PRAGMA table_info(contact_requests)");
    for (const [name, type] of columns) {
      if (!existing.some(column => column.name === name)) {
        await executor.execute(`ALTER TABLE contact_requests ADD COLUMN ${name} ${type}`);
      }
    }
  }
  await dbRunWith(executor, `CREATE INDEX IF NOT EXISTS idx_contact_mail_due
    ON contact_requests (mail_next_attempt_at, id)
    WHERE mail_sent_at IS NULL AND mail_next_attempt_at IS NOT NULL`);
}

async function migrateAdminConsentSchema(executor: DbExecutor) {
  await dbRunWith(executor, `CREATE TABLE IF NOT EXISTS admin_privacy_consents (
    id ${isPostgresExecutor(executor) ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY,
    email TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    received_at ${isPostgresExecutor(executor) ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (email, consent_version)
  )`);
}

async function migrateOtpSchema(executor: DbExecutor) {
  if (isPostgresExecutor(executor)) {
    await executor.query("ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0");
  } else {
    const columns = await dbAllWith<{ name: string }>(executor, "PRAGMA table_info(otp_codes)");
    if (!columns.some((column) => column.name === "failed_attempts")) {
      await executor.execute("ALTER TABLE otp_codes ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0");
    }
  }
  await dbRunWith(executor, "CREATE INDEX IF NOT EXISTS idx_otp_codes_email_id ON otp_codes(email, id)");
  await dbRunWith(executor, `CREATE TABLE IF NOT EXISTS admin_totp_state (
    email TEXT PRIMARY KEY,
    last_step BIGINT NOT NULL DEFAULT -1,
    attempt_window BIGINT NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0
  )`);
}

/** Rename the legacy cleaning offering once, preserving its ID and commercial settings. */
async function migrateCleaningService(executor: DbExecutor) {
  const { services } = await import("@/lib/services");
  const cleaning = services.find((service) => service.slug === "chistka-ventilyacii-i-fankoylov");
  if (!cleaning) throw new Error("Cleaning service definition is missing");
  await dbRunWith(executor, `UPDATE services
    SET slug = ?, title = ?, short_description = ?, description = ?, included = ?,
        seo_title = '', seo_description = '', seo_keywords = '', updated_at = CURRENT_TIMESTAMP
    WHERE slug = ?`, [
    cleaning.slug, cleaning.title, cleaning.shortDescription, cleaning.description,
    JSON.stringify(cleaning.included), "chistka-i-dezinfekciya-ventilyacii-fankoylov",
  ]);
}

async function runMigrations() {
  if (process.env.POSTGRES_URL) { await runPostgresMigrations(); return; }
  const client = getClient();
  const servicesTable = await dbGetWith<{ name: string }>(
    client,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ["services"],
  );
  await client.executeMultiple(schemaSql);
  await migrateOtpSchema(client);
  if (!servicesTable) await seedServicesIfEmpty(client);
  await migrateServiceImagesToWebp(client);
  await migrateAdminConsentSchema(client);
  await migrateContactConsentSchema(client);
  await migrateCleaningService(client);
  await migrateAuditSqlite(client);
  const columns = await dbAllWith<{ name: string }>(client, "PRAGMA table_info(users)");
  if (!columns.some(column => column.name === "admin_panel_password")) {
    await client.execute("ALTER TABLE users ADD COLUMN admin_panel_password TEXT");
  }
}

export async function ensureDb() {
  if (!globalForDb.skmDbReady) {
    globalForDb.skmDbReady = runMigrations().catch(error => {
      globalForDb.skmDbReady = undefined;
      throw error;
    });
  }

  await globalForDb.skmDbReady;
}

export type DbUser = {
  id: number;
  email: string;
  role: "user" | "admin";
  admin_panel_password: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicDbUser = Omit<DbUser, "admin_panel_password">;

export type DbContactRequest = {
  id: number;
  name: string | null;
  email: string | null;
  consent_version: string | null;
  consented_at: string | null;
  phone: string;
  comment: string;
  mail_attempts: number;
  mail_status: "pending" | "sending" | "retry" | "sent";
  mail_last_error: string | null;
  mail_sent_at: string | null;
  mail_next_attempt_at: string | null;
  diagnostic_ip_hash: string | null;
  diagnostic_agent: string | null;
  diagnostic_at: string | null;
  status: "new" | "in_progress" | "processed";
  created_at: string;
  updated_at: string;
};

export function isAdminEmail(email: string) {
  return configuredAdminEmail() === email.toLowerCase();
}

export function toPublicUser(user: DbUser): PublicDbUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
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
  const result = await dbRun(
    `UPDATE users
     SET admin_panel_password = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND role = 'admin' AND admin_panel_password IS NULL`,
    [passwordHash, userId],
  );
  return result.changes === 1;
}

export async function upsertUserByEmail(email: string) {
  if (!isAdminEmail(email)) throw new Error("Administrator identity required");
  const role = "admin";
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

// SQLite development/test fallback; PostgreSQL uses the checksummed SQL files.
async function migrateAuditSqlite(client: Client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      purpose TEXT NOT NULL, parent_hash TEXT, expires_at TEXT NOT NULL, revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id, expires_at);
    CREATE TABLE IF NOT EXISTS admin_security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, event_type TEXT NOT NULL,
      outcome TEXT NOT NULL, target_id TEXT, ip_hash TEXT, agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_admin_security_events_created ON admin_security_events(created_at, id);
    CREATE INDEX IF NOT EXISTS idx_contact_requests_created ON contact_requests(created_at DESC, id DESC);
  `);
  const tx = await client.transaction("write");
  try {
    const columns = await dbAllWith<{ name: string }>(tx, "PRAGMA table_info(admin_security_events)");
    for (const [oldName, newName] of [["event", "event_type"], ["target", "target_id"]]) {
      if (columns.some(column => column.name === oldName) && !columns.some(column => column.name === newName)) {
        await tx.execute(`ALTER TABLE admin_security_events RENAME COLUMN ${oldName} TO ${newName}`);
      }
    }
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; } finally { tx.close(); }
  const existing = await dbAllWith<{ name: string }>(client, "PRAGMA table_info(contact_requests)");
  for (const [name, type] of [
    ["mail_attempts", "INTEGER NOT NULL DEFAULT 0"], ["mail_status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["mail_last_error", "TEXT"], ["diagnostic_ip_hash", "TEXT"], ["diagnostic_agent", "TEXT"], ["diagnostic_at", "TEXT"],
  ]) {
    if (!existing.some(column => column.name === name)) await client.execute(`ALTER TABLE contact_requests ADD COLUMN ${name} ${type}`);
  }
}
