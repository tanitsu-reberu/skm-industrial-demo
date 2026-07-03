/**
 * Sets required Vercel env vars for OTP + Turso.
 * Usage: VERCEL_TOKEN=vcp_... node scripts/setup-vercel-env.mjs
 */
import fs from "node:fs";
import path from "node:path";

const token = process.env.VERCEL_TOKEN?.trim();
const teamId = process.env.VERCEL_TEAM_ID ?? "team_nstO9w8Wx3tj5AraxnVpmPj3";
const projectId = process.env.VERCEL_PROJECT_ID ?? "prj_mlbGcFrIHd35fvgLXRAzXm3kwhqN";

if (!token) {
  console.error("Set VERCEL_TOKEN (Vercel → Account → Tokens).");
  process.exit(1);
}

function readLocalEnv(name) {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) return null;
  return line.slice(name.length + 1).trim();
}

const vars = [
  ["RESEND_API_KEY", process.env.RESEND_API_KEY ?? readLocalEnv("RESEND_API_KEY")],
  ["OTP_FROM_EMAIL", process.env.OTP_FROM_EMAIL ?? readLocalEnv("OTP_FROM_EMAIL") ?? "SKM <no-reply@service-skm.ru>"],
  ["TURSO_DATABASE_URL", process.env.TURSO_DATABASE_URL ?? readLocalEnv("TURSO_DATABASE_URL")],
  ["TURSO_AUTH_TOKEN", process.env.TURSO_AUTH_TOKEN ?? readLocalEnv("TURSO_AUTH_TOKEN")],
];

for (const [key, value] of vars) {
  if (!value) {
    console.error(`Missing value for ${key}. Add it to .env.local or pass as env var.`);
    process.exit(1);
  }
}

const existingRes = await fetch(
  `https://api.vercel.com/v9/projects/${projectId}/env?teamId=${teamId}`,
  { headers: { Authorization: `Bearer ${token}` } },
);

if (!existingRes.ok) {
  console.error("Cannot read Vercel env:", existingRes.status, await existingRes.text());
  process.exit(1);
}

const existing = await existingRes.json();
const existingKeys = new Set((existing.envs ?? []).map((entry) => entry.key));

for (const [key, value] of vars) {
  if (existingKeys.has(key)) {
    console.log(`skip ${key} (already set)`);
    continue;
  }

  const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: ["production", "preview", "development"],
    }),
  });

  if (!res.ok) {
    console.error(`Failed to set ${key}:`, res.status, await res.text());
    process.exit(1);
  }

  console.log(`set ${key}`);
}

console.log("Done. Redeploy production in Vercel to apply env changes.");