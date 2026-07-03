import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN");
  process.exit(1);
}

process.env.TURSO_DATABASE_URL = url;
process.env.TURSO_AUTH_TOKEN = authToken;

const { ensureDb } = await import("../lib/db.ts");
await ensureDb();
console.log("Turso schema initialized.");