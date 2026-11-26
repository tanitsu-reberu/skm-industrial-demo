import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { startDatabaseBridge } from "./timeweb-db-bridge.mjs";
import { loadTimewebGeo, timewebIngress } from "./timeweb-geo.mjs";

const postgresUrl = "postgresql://skm_site@127.0.0.1:15432/skm_site?sslmode=disable";
const nextPort = 15433;
const publicPort = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535 || [15432, nextPort].includes(publicPort)) {
  throw new Error("Invalid Timeweb public port");
}

let bridge;
let isRussianClient;
try {
  isRussianClient = await loadTimewebGeo();
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
  console.error("Could not verify Timeweb geo settings or the website database.");
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const env = { ...process.env, POSTGRES_URL: postgresUrl, ADMIN_GEO_PROXY_TOKEN: token };
if (process.env.SKM_SITE_ADMIN_EMAIL) {
  env.ADMIN_EMAIL = process.env.SKM_SITE_ADMIN_EMAIL;
  delete env.ADMIN_EMAILS;
}
delete env.SKM_DB_JUMP_KEY_BASE64;
delete env.SKM_DB_HOME_KEY_BASE64;
const app = spawn(process.execPath, [
  path.resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(nextPort),
], { env, stdio: "inherit" });
const ingress = timewebIngress({ isRussianClient, trustedClientIp: isRussianClient.trustedClientIp, token, nextPort });

function close() {
  ingress.close();
  bridge.close();
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    close();
    app.kill(signal);
  });
}
ingress.once("error", () => app.kill("SIGTERM"));
app.once("error", () => {
  close();
  process.exit(1);
});
app.once("exit", code => {
  close();
  process.exit(code ?? 1);
});
ingress.listen(publicPort, process.env.SKM_WEB_BIND_HOST ?? "0.0.0.0");
