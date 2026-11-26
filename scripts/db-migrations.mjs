import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

export async function setTransactionTimeouts(client) {
  const lock = Number(process.env.SKM_DB_LOCK_TIMEOUT_MS ?? 10000);
  const statement = Number(process.env.SKM_DB_STATEMENT_TIMEOUT_MS ?? 60000);
  if (!Number.isSafeInteger(lock) || lock < 1 || lock > 10000 ||
      !Number.isSafeInteger(statement) || statement < lock || statement > 60000) throw new Error("Invalid bounded database timeouts");
  await client.query("SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)", [`${lock}ms`, `${statement}ms`]);
}

export async function migrationInventory() {
  const files = (await fs.readdir(directory)).filter(name => /^\d{3}-[a-z-]+\.sql$/.test(name)).sort();
  return Promise.all(files.map(async version => {
    const sql = (await fs.readFile(path.join(directory, version), "utf8")).replace(/\r\n/g, "\n");
    return { version, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

export async function applyMigrations(client, { inTransaction = false, sourceUTCVerified = false, through = "999" } = {}) {
  if (!inTransaction) await client.query("BEGIN");
  try {
    await setTransactionTimeouts(client);
    await client.query("SELECT pg_advisory_xact_lock(57065006)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const applied = new Map((await client.query("SELECT version, checksum FROM schema_migrations")).rows.map(row => [row.version, row.checksum]));
    const inventory = await migrationInventory();
    for (const [version, checksum] of applied) {
      if (!inventory.some(item => item.version === version && item.checksum === checksum)) {
        throw new Error(`Migration checksum mismatch or missing file: ${version}`);
      }
    }
    for (const item of inventory) {
      if (applied.has(item.version) || item.version > through) continue;
      if (item.version.startsWith("002")) {
        const source = await client.query(`SELECT data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'admin_privacy_consents' AND column_name = 'received_at'`);
        if (source.rows[0]?.data_type === "timestamp without time zone" && !sourceUTCVerified) {
          throw new Error("Verify historical consent source timezone and supply --source-utc-verified before migration 002");
        }
      }
      await client.query(item.sql);
      await client.query("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", [item.version, item.checksum]);
    }
    if (!inTransaction) await client.query("COMMIT");
  } catch (error) {
    if (!inTransaction) await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const allowed = new Set(["--apply", "--preflight", "--postflight", "--additive-only", "--source-utc-verified"]);
  if (process.argv.slice(2).some(arg => !allowed.has(arg))) throw new Error("Unknown migration option");
  const client = new pg.Client({ connectionString: process.env.POSTGRES_URL, connectionTimeoutMillis: 5000 });
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL required");
  await client.connect();
  try {
    if (process.argv.includes("--apply")) {
      await applyMigrations(client, {
        sourceUTCVerified: process.argv.includes("--source-utc-verified"),
        through: process.argv.includes("--additive-only") ? "001~" : "999",
      });
    }
    const schema = await client.query(`SELECT table_name, column_name, data_type
      FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name IN ('admin_sessions', 'admin_security_events', 'contact_requests', 'admin_privacy_consents')
      ORDER BY table_name, ordinal_position`);
    const exists = await client.query("SELECT to_regclass('public.schema_migrations') AS name");
    const applied = exists.rows[0].name ? (await client.query("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version")).rows : [];
    const inventory = await migrationInventory();
    for (const row of applied) {
      if (!inventory.some(item => item.version === row.version && item.checksum === row.checksum)) throw new Error("Migration checksum mismatch");
    }
    if (process.argv.includes("--postflight") && applied.length !== inventory.length) throw new Error("Pending migrations");
    console.log(JSON.stringify({ schema: schema.rows, applied, files: inventory.map(({ version, checksum }) => ({ version, checksum })) }, null, 2));
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "Migration failed"); process.exitCode = 1; });
}
