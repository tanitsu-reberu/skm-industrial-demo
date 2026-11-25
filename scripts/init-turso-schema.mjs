import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN");
  process.exit(1);
}

const dbSource = fs.readFileSync(path.join(process.cwd(), "lib", "db.ts"), "utf8");
const schemaMatch = dbSource.match(/const schemaSql = `([\s\S]*?)`;/);
if (!schemaMatch) {
  console.error("Could not extract schema SQL from lib/db.ts");
  process.exit(1);
}

const client = createClient({ url, authToken });
await client.executeMultiple(schemaMatch[1]);

const columns = await client.execute("PRAGMA table_info(users)");
const hasAdminPassword = columns.rows.some((row) => row[1] === "admin_panel_password");
if (!hasAdminPassword) {
  await client.execute("ALTER TABLE users ADD COLUMN admin_panel_password TEXT");
}


console.log("Turso schema initialized.");