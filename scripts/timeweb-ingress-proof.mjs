import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { startDatabaseBridge } from "./timeweb-db-bridge.mjs";

const secret = Buffer.from(process.env.SKM_PROOF_TOKEN ?? "");
if (secret.length < 32) throw new Error("The private probe token is required");

let ready;
async function readOnlyProof() {
  const client = new pg.Client({
    host: "127.0.0.1", port: 15432, user: "skm_site", database: "skm_site",
    connectionTimeoutMillis: 8_000, ssl: false,
  });
  try {
    ready ??= startDatabaseBridge().catch(error => {
      ready = undefined;
      throw error;
    });
    await ready;
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const { rows: [row] } = await client.query(
      "SELECT current_database() = 'skm_site' AND current_user = 'skm_site' AND EXISTS (SELECT 1 FROM services) AS ok",
    );
    await client.query("ROLLBACK");
    return row?.ok === true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

createServer(async (request, response) => {
  const supplied = Buffer.from(request.headers["x-skm-proof-token"] ?? "");
  if (request.method !== "GET" || request.url !== "/probe" ||
      supplied.length !== secret.length || !timingSafeEqual(secret, supplied)) {
    response.writeHead(404, { "Cache-Control": "no-store" }).end();
    return;
  }

  const db = await readOnlyProof();
  response.writeHead(db ? 200 : 503, {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
  }).end(JSON.stringify({
    database: db,
    peer: request.socket.remoteAddress,
    forwardedFor: request.headers["x-forwarded-for"] ?? null,
    forwardedProto: request.headers["x-forwarded-proto"] ?? null,
  }));
}).listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
