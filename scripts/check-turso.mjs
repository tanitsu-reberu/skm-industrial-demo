import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
);
console.log("tables:", tables.rows.map((row) => row[0]).join(", ") || "(none)");