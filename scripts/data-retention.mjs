import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertExpectedDatabase, expectedDatabaseName, verifyBackup } from "./backup-validation.mjs";
import { setTransactionTimeouts } from "./db-migrations.mjs";

const quote = value => `"${value.replaceAll('"', '""')}"`;
const retiredTables = ["balance_topup_requests", "chat_events", "invoices", "orders", "payments",
  "service_invoice_requests", "topup_requests", "transactions"];
// Business records are inventoried/exported, never included in automated DELETE.
export function legacyTable(name) {
  return retiredTables.includes(name) || /^(?:chat_|messages$|conversations$|financial_|balance_|balances$|wallets$)/.test(name);
}

export async function retireEmptyLegacy(client, options = {}) {
  const { expectedDatabase } = options;
  await verifyBackup(options);
  await client.query("BEGIN");
  try {
    await setTransactionTimeouts(client);
    await assertExpectedDatabase(client, expectedDatabase);
    await client.query("SELECT pg_advisory_xact_lock(57065007)");
    const names = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[]) ORDER BY tablename", [retiredTables])).rows.map(row => row.tablename);
    if (names.length) {
      const list = names.map(name => `public.${quote(name)}`).join(", ");
      await client.query(`LOCK TABLE ${list} IN ACCESS EXCLUSIVE MODE`);
      for (const name of names) {
        const row = (await client.query(`SELECT EXISTS (SELECT 1 FROM public.${quote(name)} LIMIT 1) AS populated`)).rows[0];
        if (row.populated) throw new Error(`Nonempty legacy table retained: ${name}`);
      }
      // One atomic DROP supports FKs inside the allowlist; external dependencies abort. No CASCADE.
      await client.query(`DROP TABLE ${list}`);
      await client.query("INSERT INTO admin_security_events (event_type, outcome, target_id) VALUES ('maintenance.retire_empty', 'success', $1)", [JSON.stringify(names)]);
    }
    await client.query("COMMIT");
    return names;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

export async function retentionInventory(client) {
  const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows;
  const inventory = [];
  for (const { tablename } of tables) {
    const row = (await client.query(`SELECT COUNT(*) AS total FROM public.${quote(tablename)}`)).rows[0];
    inventory.push({ table: tablename, rows: Number(row.total), policy: legacyTable(tablename) ? "archive-review-no-delete" : "active-or-ephemeral" });
  }
  return inventory;
}

export async function cleanEphemeral(client, { apply = false, batchSize = 1000, expectedDatabase } = {}) {
  expectedDatabaseName(expectedDatabase);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new Error("Batch must be 1..5000");
  const rules = [
    ["otp_codes", "id", "expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'"],
    ["admin_sessions", "token_hash", "expires_at <= CURRENT_TIMESTAMP"],
    ["admin_security_events", "id", "created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'"],
    ["admin_totp_state", "email", `(email LIKE 'contact:%' AND attempt_window < FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 60) - 1440)
      OR (email LIKE 'audit:%' AND attempt_window < FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 60) - 1440)
      OR (email LIKE 'panel:%' AND attempt_window < FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 300) - 288)`],
  ];
  await client.query("BEGIN");
  try {
    await setTransactionTimeouts(client);
    await assertExpectedDatabase(client, expectedDatabase);
    await client.query("SELECT pg_advisory_xact_lock(57065007)");
    const counts = {};
    for (const [table, key, predicate] of rules) {
      const selected = `SELECT ${quote(key)} FROM ${quote(table)} WHERE ${predicate} ORDER BY ${quote(key)} LIMIT $1`;
      const result = apply
        ? await client.query(`DELETE FROM ${quote(table)} WHERE ${quote(key)} IN (${selected})`, [batchSize])
        : await client.query(`SELECT COUNT(*) AS total FROM (${selected}) AS bounded`, [batchSize]);
      counts[table] = apply ? result.rowCount : Number(result.rows[0].total);
    }
    const diagnostic = `SELECT id FROM contact_requests WHERE diagnostic_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
      ORDER BY id LIMIT $1`;
    const result = apply ? await client.query(`UPDATE contact_requests
      SET diagnostic_ip_hash = NULL, diagnostic_agent = NULL, diagnostic_at = NULL WHERE id IN (${diagnostic})`, [batchSize])
      : await client.query(`SELECT COUNT(*) AS total FROM (${diagnostic}) AS bounded`, [batchSize]);
    counts.contact_diagnostics = apply ? result.rowCount : Number(result.rows[0].total);
    if (apply) await client.query(`INSERT INTO admin_security_events (event_type, outcome, target_id)
      VALUES ('maintenance.cleanup', 'success', $1)`, [JSON.stringify(counts)]);
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return counts;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

export async function runRetention(client, { apply = false, expectedDatabase, maxBatches = 4, timeBudgetMs = 120000 } = {}) {
  expectedDatabaseName(expectedDatabase);
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 4 ||
      !Number.isSafeInteger(timeBudgetMs) || timeBudgetMs < 1 || timeBudgetMs > 120000) throw new Error("Invalid bounded retention budget");
  const started = Date.now();
  const totals = {};
  let batches = 0, backlogPossible = false;
  do {
    const counts = await cleanEphemeral(client, { apply, expectedDatabase });
    batches += 1;
    for (const [table, count] of Object.entries(counts)) totals[table] = (totals[table] ?? 0) + count;
    backlogPossible = Object.values(counts).some(count => count >= 1000);
  } while (apply && backlogPossible && batches < maxBatches && Date.now() - started < timeBudgetMs);
  return { applied: apply, counts: totals, batches, backlogPossible };
}

async function archive(client, output, expectedDatabase) {
  await assertExpectedDatabase(client, expectedDatabase);
  const inventory = (await retentionInventory(client)).filter(row => row.policy === "archive-review-no-delete");
  if (!inventory.length) throw new Error("No legacy business tables found");
  const target = path.resolve(output);
  // File is exclusive and private; credentials remain in the child environment.
  const file = await fs.open(target, "wx", 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl",
        ...inventory.flatMap(row => ["--table", `public.${quote(row.table)}`])], {
        env: { ...process.env, PGDATABASE: process.env.POSTGRES_URL }, stdio: ["ignore", file.fd, "pipe"],
      });
      child.stderr.resume(); // Never print connection details or business content.
      child.on("error", reject);
      child.on("exit", code => code === 0 ? resolve() : reject(new Error("pg_dump failed")));
    });
  } finally { await file.close(); }
  const digest = createHash("sha256");
  const input = (await import("node:fs")).createReadStream(target);
  for await (const chunk of input) digest.update(chunk);
  await fs.writeFile(`${target}.manifest.json`, JSON.stringify({ createdAt: new Date().toISOString(),
    kind: "legacy-export", database: expectedDatabase, checksum: digest.digest("hex"), inventory, deletion: "none" }, null, 2), { flag: "wx", mode: 0o600 });
  return { archive: target, tables: inventory.length };
}

export function parseRetentionArgs(args) {
  if (new Set(args).size !== args.length) throw new Error("Duplicate retention options");
  const flags = new Set(["--apply", "--inventory", "--dry-run", "--retire-empty-legacy"]);
  const keys = ["--archive=", "--backup=", "--backup-sha256=", "--backup-manifest=", "--expected-database="];
  if (args.some(arg => !flags.has(arg) && !keys.some(prefix => arg.startsWith(prefix)))) throw new Error("Unknown retention option");
  for (const key of keys) if (args.filter(arg => arg.startsWith(key)).length > 1) throw new Error("Duplicate retention option");
  const value = key => args.find(arg => arg.startsWith(key))?.slice(key.length);
  const apply = args.includes("--apply"), dry = args.includes("--dry-run"), inventory = args.includes("--inventory"), retire = args.includes("--retire-empty-legacy");
  const output = value("--archive=");
  const backup = value("--backup="), checksum = value("--backup-sha256="), manifest = value("--backup-manifest=");
  const expectedDatabase = expectedDatabaseName(value("--expected-database="));
  if (apply && dry || Number(inventory) + Number(output !== undefined) + Number(retire) > 1) throw new Error("Conflicting retention modes");
  if ((inventory || output !== undefined) && (apply || dry) || !retire && [backup, checksum, manifest].some(item => item !== undefined)) throw new Error("Conflicting retention options");
  if (output !== undefined && !path.isAbsolute(output)) throw new Error("Absolute archive output required");
  if (retire && (!apply || dry || !backup || !manifest || !/^[a-f0-9]{64}$/.test(checksum ?? ""))) throw new Error("Retirement requires explicit apply and verified backup provenance");
  return { apply, expectedDatabase, output, backup, checksum, manifest, inventory, retire };
}

async function main() {
  // Parse all modes before even constructing/connecting a database client.
  const options = parseRetentionArgs(process.argv.slice(2));
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL required");
  const client = new pg.Client({ connectionString: process.env.POSTGRES_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    if (options.retire) console.log(JSON.stringify({ retired: await retireEmptyLegacy(client, options) }));
    else if (options.output) console.log(JSON.stringify(await archive(client, options.output, options.expectedDatabase)));
    else if (options.inventory) {
      await assertExpectedDatabase(client, options.expectedDatabase);
      console.log(JSON.stringify(await retentionInventory(client), null, 2));
    } else {
      const result = await runRetention(client, options);
      console.log(JSON.stringify(result, null, 2));
      if (result.backlogPossible) console.error("Retention backlog remains after bounded drain; inspect timer capacity.");
    }
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Retention failed; inspect local permissions and database availability."); process.exitCode = 1; });
}
