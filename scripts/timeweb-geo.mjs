import { createHash } from "node:crypto";
import { createServer, request as sendRequest } from "node:http";
import { isIP } from "node:net";
import { gunzipSync, createGunzip, createBrotliDecompress, createInflate } from "node:zlib";
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
  const trustedClientIp = (peer, forwarded) => peers.has(singleIp(peer)) ? singleIp(forwarded) : null;
  const isRussian = (peer, forwarded) => {
    const clientIp = trustedClientIp(peer, forwarded);
    return Boolean(clientIp && countries.get(clientIp)?.country?.iso_code === "RU");
  };
  return Object.assign(isRussian, { trustedClientIp });
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

// All HTML/RSC/action responses may carry session-dependent content. Compress only public assets.
export function isPublicAssetRequest(url = "", method = "GET") {
  const pathname = url.split("?")[0];
  return ["GET", "HEAD"].includes(method) && /^(?:\/_next\/(?:static\/|image(?:$|\/))|\/api\/uploads\/services\/[^/]+\.(?:png|jpe?g|webp|avif)$|\/(?:logo\.(?:png|webp|svg)|icon\.png|apple-touch-icon\.png|favicon\.ico|sw\.js|robots\.txt|sitemap\.xml|manifest\.webmanifest)$|\/(?:services|documents)\/[^/]+\.(?:svg|webp|png|jpe?g|avif|ico|docx)$)/.test(pathname);
}

export function timewebIngress({ isRussianClient, token, nextPort, trustedClientIp = () => null }) {
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
    delete headers["x-skm-client-ip"];
    const dynamic = !isPublicAssetRequest(incoming.url, incoming.method);
    if (dynamic) delete headers["accept-encoding"];
    const clientIp = trustedClientIp(incoming.socket.remoteAddress, incoming.headers["x-forwarded-for"]);
    if (clientIp) {
      headers["x-skm-client-ip"] = clientIp;
      headers["x-skm-geo-token"] = token;
    }

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
      const responseHeaders = endToEndHeaders(response.headers);
      const sensitiveResponse = dynamic || !/^(?:public)(?:,|$)/i.test(String(responseHeaders["cache-control"] ?? "")) &&
        /(?:text\/html|text\/x-component|application\/json)/i.test(String(responseHeaders["content-type"] ?? ""));
      let body = response;
      if (sensitiveResponse) {
        responseHeaders["cache-control"] = "private, no-store, no-transform";
        const encoding = responseHeaders["content-encoding"];
        const decoder = encoding === "gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress() : encoding === "deflate" ? createInflate() : null;
        if (encoding && encoding !== "identity" && !decoder) {
          response.resume();
          outgoing.writeHead(502, { "Cache-Control": "private, no-store, no-transform" }).end();
          return;
        }
        if (decoder) {
          delete responseHeaders["content-encoding"];
          delete responseHeaders["content-length"];
          delete responseHeaders.etag;
          decoder.on("error", () => outgoing.destroy());
          body = response.pipe(decoder);
        }
      }
      outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
      response.on("error", () => outgoing.destroy());
      body.pipe(outgoing);
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
