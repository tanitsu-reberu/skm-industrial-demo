import { createClient } from "@libsql/client";
import { createClient as createTursoApi } from "@tursodatabase/api";

const org = process.env.TURSO_ORG;
const orgId = process.env.TURSO_ORG_ID;
const apiToken = process.env.TURSO_API_TOKEN;
const dbName = process.env.TURSO_DB_NAME ?? "skm-industrial-demo";

if (!apiToken) {
  console.error("Set TURSO_API_TOKEN (Turso dashboard → Settings → API Tokens).");
  process.exit(1);
}

if (!org && !orgId) {
  console.error("Set TURSO_ORG or TURSO_ORG_ID.");
  process.exit(1);
}

const turso = createTursoApi({ token: apiToken, org, orgId });

const groups = await turso.groups.list();
if (!groups.some((group) => group.name === "default")) {
  await turso.groups.create("default", "aws-eu-west-1");
  console.log("Group created: default (aws-eu-west-1)");
}

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
