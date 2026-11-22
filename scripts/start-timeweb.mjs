import { spawn } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { startDatabaseBridge } from "./timeweb-db-bridge.mjs";

const postgresUrl = "postgresql://skm_site@127.0.0.1:15432/skm_site?sslmode=disable";
let bridge;
try {
  bridge = await startDatabaseBridge();

  const client = new pg.Client({ connectionString: postgresUrl, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    await client.query("SELECT 1 FROM services LIMIT 1");
  } finally {
    await client.end();
  }
} catch {
  bridge?.close();
  console.error("Could not verify the website database via the Timeweb tunnel.");
  process.exit(1);
}

const env = { ...process.env, POSTGRES_URL: postgresUrl };
delete env.SKM_DB_JUMP_KEY_BASE64;
delete env.SKM_DB_HOME_KEY_BASE64;
const args = [path.resolve("node_modules/next/dist/bin/next"), "start"];
if (process.env.SKM_WEB_BIND_HOST) args.push("--hostname", process.env.SKM_WEB_BIND_HOST);
const app = spawn(process.execPath, args, {
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    bridge.close();
    app.kill(signal);
  });
}
app.once("error", () => {
  bridge.close();
  process.exit(1);
});
app.once("exit", code => {
  bridge.close();
  process.exit(code ?? 1);
});
