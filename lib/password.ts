import "server-only";
import crypto from "node:crypto";

const KEY_LEN = 64;
const CURRENT_N = 131072;
const MAX_ACTIVE = 2;
let active = 0;

async function derive(password: string, salt: Buffer, N: number): Promise<Buffer> {
  if (active >= MAX_ACTIVE) throw new Error("Password verifier busy");
  active += 1;
  try {
    return await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, KEY_LEN, { N, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
        (error, key) => error ? reject(error) : resolve(key));
    });
  } finally { active -= 1; }
}

export async function hashPassword(password: string) {
  if (!password || password.length > 128) throw new Error("Invalid password length");
  const salt = crypto.randomBytes(16);
  const hash = await derive(password, salt, CURRENT_N);
  return `scrypt-v2:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function passwordNeedsRehash(stored: string) {
  return stored.startsWith("scrypt:");
}

export async function verifyPassword(password: string, stored: string) {
  if (!password || password.length > 128 || typeof stored !== "string" || stored.length > 160) return false;
  const match = /^(scrypt|scrypt-v2):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{86})$/.exec(stored);
  if (!match) return false;
  const salt = Buffer.from(match[2], "base64url");
  const expected = Buffer.from(match[3], "base64url");
  if (salt.length !== 16 || expected.length !== KEY_LEN || salt.toString("base64url") !== match[2] || expected.toString("base64url") !== match[3]) return false;
  try {
    const actual = await derive(password, salt, match[1] === "scrypt" ? 16384 : CURRENT_N);
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
