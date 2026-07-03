import { createClient } from "@libsql/client";
import { createClient as createTursoApi } from "@tursodatabase/api";
import fs from "node:fs";
import path from "node:path";

const org = process.env.TURSO_ORG;
const apiToken = process.env.TURSO_API_TOKEN;
const dbName = process.env.TURSO_DB_NAME ?? "skm-industrial-demo";
const localDbPath = path.join(process.cwd(), "data", "skm.sqlite");

if (!org || !apiToken) {
  console.error("Set TURSO_ORG and TURSO_API_TOKEN (Turso dashboard → Settings → API Tokens).");
  process.exit(1);
}

const turso = createTursoApi({ token: apiToken, org });

let database;
try {
  database = await turso.databases.get(dbName);
  console.log(`Database already exists: ${database.name}`);
} catch {
  database = await turso.databases.create(dbName, { group: "default" });
  console.log(`Database created: ${database.name}`);
}

const token = await turso.databases.createToken(dbName, {
  expiration: "never",
});

const databaseUrl = `libsql://${database.hostname}`;
console.log("TURSO_DATABASE_URL=" + databaseUrl);
console.log("TURSO_AUTH_TOKEN=" + token.jwt);

const remote = createClient({ url: databaseUrl, authToken: token.jwt });
await remote.execute("SELECT 1");
console.log("Remote connection OK.");