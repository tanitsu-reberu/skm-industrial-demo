import { createClient as createNodeClient } from "@libsql/client";
import { createClient as createWebClient } from "@libsql/client/web";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN");
  process.exit(1);
}

for (const [name, factory] of [
  ["node", createNodeClient],
  ["web", createWebClient],
]) {
  try {
    const client = factory({ url, authToken });
    const result = await client.execute("SELECT COUNT(*) AS c FROM otp_codes");
    console.log(name, "ok", result.rows[0]);
  } catch (error) {
    console.error(name, "fail", error);
  }
}