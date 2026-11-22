import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const [, , account, output] = process.argv;
const email = account?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !output) {
  console.error("Usage: node scripts/generate-totp-key.mjs admin@example.test path/to/private-key.json");
  process.exit(1);
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let key = "";
let value = 0;
let bits = 0;
for (const byte of randomBytes(20)) {
  value = (value << 8) | byte;
  bits += 8;
  while (bits >= 5) {
    bits -= 5;
    key += alphabet[(value >>> bits) & 31];
  }
}

writeFileSync(output, JSON.stringify({ [email]: key }) + "\n", { flag: "wx", mode: 0o600 });
console.log("Private setup key saved to the requested file.");
