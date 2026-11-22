import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { dbGet, dbRun } from "@/lib/db";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const stepSeconds = 30;
const attemptWindowMs = 5 * 60 * 1000;

function adminSecret(email: string) {
  try {
    const secrets: unknown = JSON.parse(process.env.ADMIN_TOTP_SECRETS ?? "{}");
    if (!secrets || typeof secrets !== "object" || !Object.hasOwn(secrets, email)) return null;
    const key = (secrets as Record<string, unknown>)[email];
    return typeof key === "string" && /^[A-Z2-7]{32}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

export function isAdminAuthenticatorConfigured(email: string) {
  return adminSecret(email) !== null;
}

export function authenticatorCode(secret: string, step: number) {
  let bits = 0;
  let value = 0;
  const key = [];
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      key.push((value >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", Buffer.from(key)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

export async function verifyAdminAuthenticator(email: string, code: string) {
  const key = adminSecret(email);
  if (!key || !/^\d{6}$/.test(code)) return false;

  const now = Date.now();
  const window = Math.floor(now / attemptWindowMs);
  const attempt = await dbGet<{ attempts: number }>(
    `INSERT INTO admin_totp_state (email, attempt_window, attempts)
     VALUES (?, ?, 1)
     ON CONFLICT (email) DO UPDATE
       SET attempts = CASE WHEN admin_totp_state.attempt_window = excluded.attempt_window
                           THEN admin_totp_state.attempts + 1 ELSE 1 END,
           attempt_window = excluded.attempt_window
       WHERE admin_totp_state.attempt_window < excluded.attempt_window
          OR (admin_totp_state.attempt_window = excluded.attempt_window AND admin_totp_state.attempts < 5)
     RETURNING attempts`,
    [email, window],
  );
  if (!attempt) return false;

  const current = Math.floor(now / (stepSeconds * 1000));
  const input = Buffer.from(code, "ascii");
  const matched = [current, current - 1, current + 1].find((step) =>
    timingSafeEqual(Buffer.from(authenticatorCode(key, step), "ascii"), input),
  );
  if (matched === undefined) return false;

  const consumed = await dbRun(
    "UPDATE admin_totp_state SET last_step = ? WHERE email = ? AND last_step < ?",
    [matched, email, matched],
  );
  return consumed.changes === 1;
}
