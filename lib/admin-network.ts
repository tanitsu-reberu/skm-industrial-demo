import "server-only";

import { timingSafeEqual } from "node:crypto";

export function allowsAdminNetwork(headers: Pick<Headers, "get">) {
  const configuredToken = process.env.ADMIN_GEO_PROXY_TOKEN;
  if (configuredToken === undefined) return true;

  const proxyToken = headers.get("x-skm-geo-token");
  if (!/^[a-zA-Z0-9_-]{43,128}$/.test(configuredToken) ||
      !proxyToken || headers.get("x-skm-country") !== "RU") {
    return false;
  }

  const expected = Buffer.from(configuredToken);
  const received = Buffer.from(proxyToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
