import { createHash } from "node:crypto";
import { createServer, request as sendRequest } from "node:http";
import { isIP } from "node:net";
import { gunzipSync } from "node:zlib";
import maxmind from "maxmind";

const databaseUrl = "https://download.db-ip.com/free/dbip-country-lite-2026-11.mmdb.gz";
const databaseHash = "145ce5dfb812d8de28547e6289bb5c5f8b3df2f1dea21d324d5b575e0431311f";

function singleIp(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^::ffff:(?=\d+\.)/i, "");
  return isIP(normalized) ? normalized : null;
}

export async function loadTimewebGeo() {
  const configuredPeers = process.env.SKM_TIMEWEB_PROXY_PEERS?.split(",") ?? [];
  const peers = new Set(configuredPeers.map(singleIp));
  if (!peers.size || peers.has(null)) {
    throw new Error("Configure verified Timeweb ingress peer addresses");
  }

  const response = await fetch(databaseUrl, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Could not download the verified country database");
  const source = gunzipSync(Buffer.from(await response.arrayBuffer()), { maxOutputLength: 16 * 1024 * 1024 });
  if (createHash("sha256").update(source).digest("hex") !== databaseHash) {
    throw new Error("The country database checksum differs from the verified release");
  }

  const countries = new maxmind.Reader(source);
  return (peer, forwarded) => {
    if (!peers.has(singleIp(peer))) return false;
    const clientIp = singleIp(forwarded);
    return Boolean(clientIp && countries.get(clientIp)?.country?.iso_code === "RU");
  };
}

const connectionHeaders = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
];

function endToEndHeaders(headers) {
  const filtered = { ...headers };
  for (const name of [...connectionHeaders, ...String(filtered.connection ?? "").split(",")]) {
    delete filtered[name.trim().toLowerCase()];
  }
  return filtered;
}

export function timewebIngress({ isRussianClient, token, nextPort }) {
  return createServer((incoming, outgoing) => {
    const adminPath = /^\/admin(?:\/|\?|$)/.test(incoming.url ?? "");
    const bodyLimit = adminPath ? 26 * 1024 * 1024 : 64 * 1024;
    const declaredSize = Number(incoming.headers["content-length"] ?? 0);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > bodyLimit) {
      outgoing.writeHead(413, { "Cache-Control": "no-store", "Connection": "close" }).end();
      incoming.resume();
      return;
    }
    const headers = endToEndHeaders(incoming.headers);
    delete headers["x-skm-country"];
    delete headers["x-skm-geo-token"];

    if (isRussianClient(incoming.socket.remoteAddress, incoming.headers["x-forwarded-for"])) {
      headers["x-skm-country"] = "RU";
      headers["x-skm-geo-token"] = token;
    }

    const upstream = sendRequest({
      host: "127.0.0.1",
      port: nextPort,
      method: incoming.method,
      path: incoming.url,
      headers,
    }, response => {
      outgoing.writeHead(response.statusCode ?? 502, endToEndHeaders(response.headers));
      response.on("error", () => outgoing.destroy());
      response.pipe(outgoing);
    });
    upstream.on("error", () => {
      if (outgoing.headersSent) {
        outgoing.destroy();
      } else {
        outgoing.writeHead(502, { "Cache-Control": "no-store" }).end();
      }
    });
    incoming.on("error", () => upstream.destroy());
    outgoing.once("close", () => upstream.destroy());
    let received = 0;
    let bodyRejected = false;
    incoming.on("data", chunk => {
      received += chunk.length;
      if (received > bodyLimit && !bodyRejected) {
        bodyRejected = true;
        incoming.unpipe(upstream);
        outgoing.writeHead(413, { "Cache-Control": "no-store", "Connection": "close" }).end();
        upstream.destroy();
        incoming.resume();
      }
    });
    incoming.pipe(upstream);
  });
}
