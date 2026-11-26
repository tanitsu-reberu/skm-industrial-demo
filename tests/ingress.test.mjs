import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { gzipSync, gunzipSync } from "node:zlib";
import test from "node:test";
import { timewebIngress } from "../scripts/timeweb-geo.mjs";

function get(port, url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: url, headers }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject); req.end();
  });
}

test("authenticated HTML/RSC loses compression; assets retain compression/cache; forged ingress stripped", async () => {
  const observed = [];
  const origin = createServer((incoming, outgoing) => {
    observed.push(incoming.headers);
    const asset = incoming.url === "/_next/static/fixture.js";
    const body = Buffer.from(asset ? "publicAsset();" : `authenticated=${incoming.headers.cookie === "session=fixture"}; reflected=fixture; csrf=synthetic-secret`);
    const compress = Boolean(incoming.headers["accept-encoding"]) || incoming.url === "/services/missing.webp";
    outgoing.writeHead(200, { "Content-Type": asset ? "application/javascript" : "text/html",
      "Cache-Control": asset ? "public, max-age=31536000, immutable" : "private, no-store",
      "Content-Security-Policy": "script-src 'nonce-fixture'", "Set-Cookie": "session=fixture; Secure; HttpOnly; SameSite=Lax",
      ...(compress ? { "Content-Encoding": "gzip" } : {}) });
    outgoing.end(compress ? gzipSync(body) : body);
  });
  await new Promise(resolve => origin.listen(0, "127.0.0.1", resolve));
  const token = "t".repeat(43);
  const ingress = timewebIngress({ nextPort: origin.address().port, token, isRussianClient: () => true,
    trustedClientIp: () => "192.0.2.20" });
  await new Promise(resolve => ingress.listen(0, "127.0.0.1", resolve));
  try {
    for (const url of ["/admin?q=fixture", "/api/session", "/services/missing.webp"]) {
      const response = await get(ingress.address().port, url, { Cookie:"session=fixture", "Accept-Encoding":"gzip, br",
        "x-skm-client-ip":"198.51.100.1", "x-skm-country":"US", "x-skm-geo-token":"forged" });
      assert.equal(response.headers["content-encoding"], undefined);
      assert.match(response.headers["cache-control"], /no-transform/);
      assert.match(response.body.toString(), /authenticated=true/);
      assert.equal(response.headers["content-security-policy"], "script-src 'nonce-fixture'");
      assert.match(response.headers["set-cookie"][0], /Secure; HttpOnly; SameSite=Lax/);
      assert.equal(observed.at(-1)["x-skm-client-ip"],"192.0.2.20");
      assert.equal(observed.at(-1)["x-skm-geo-token"],token);
    }
    assert.equal(observed[0]["accept-encoding"],undefined);
    const asset = await get(ingress.address().port,"/_next/static/fixture.js",{"Accept-Encoding":"gzip"});
    assert.equal(asset.headers["content-encoding"],"gzip");assert.match(asset.headers["cache-control"],/public.*immutable/);
    assert.equal(gunzipSync(asset.body).toString(),"publicAsset();");
  } finally { await Promise.all([new Promise(resolve=>ingress.close(resolve)),new Promise(resolve=>origin.close(resolve))]); }
});
