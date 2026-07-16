import pg from "pg";

const { Client } = pg;
if (!process.env.POSTGRES_URL) {
  console.error("[error] missing=POSTGRES_URL");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.POSTGRES_URL });
const tables = [
  "users",
  "services",
  "otp_codes",
  "orders",
  "invoices",
  "payments",
  "transactions",
  "balance_topup_requests",
  "topup_requests",
  "service_invoice_requests",
  "contact_requests",
  "chat_events",
];

try {
  await client.connect();
  const metadata = await client.query("SELECT current_database() AS database, current_user AS user, current_schema() AS schema");
  console.log(`[metadata] database=${metadata.rows[0].database} user=${metadata.rows[0].user} schema=${metadata.rows[0].schema}`);

  const privileges = await client.query("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' GROUP BY grantee, privilege_type ORDER BY grantee, privilege_type");
  for (const row of privileges.rows) console.log(`[privilege] schema=public grantee=${row.grantee} privilege=${row.privilege_type}`);

  const existing = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
  for (const row of existing.rows) console.log(`[table] ${row.table_name}`);

  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
    console.log(`[count] ${table} count=${result.rows[0].count}`);
  }
} catch (error) {
  console.error(`[error] code=${error?.code ?? "unknown"}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
