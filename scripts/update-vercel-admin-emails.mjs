/**
 * Updates ADMIN_EMAILS on Vercel (production + preview + development).
 * Usage: VERCEL_TOKEN=vcp_... node scripts/update-vercel-admin-emails.mjs
 */
import fs from "node:fs";
import path from "node:path";

const token = process.env.VERCEL_TOKEN?.trim();
const teamId = process.env.VERCEL_TEAM_ID ?? "team_nstO9w8Wx3tj5AraxnVpmPj3";
const projectId = process.env.VERCEL_PROJECT_ID ?? "prj_mlbGcFrIHd35fvgLXRAzXm3kwhqN";

if (!token) {
  console.error("Set VERCEL_TOKEN");
  process.exit(1);
}

function readLocalAdminEmails() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("ADMIN_EMAILS="));
  return line ? line.slice("ADMIN_EMAILS=".length).trim() : null;
}

const adminEmails =
  process.env.ADMIN_EMAILS?.trim() ??
  readLocalAdminEmails() ??
  "fateewkostik@hotmail.com,skm.moskow.www@gmail.com,i@skmoscow.ru";

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function api(path, options = {}) {
  const url = `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${teamId}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const envs = await api(`/v9/projects/${projectId}/env`);
const existing = (envs.envs ?? []).find((entry) => entry.key === "ADMIN_EMAILS");

if (existing) {
  await api(`/v9/projects/${projectId}/env/${existing.id}`, { method: "DELETE" });
  console.log("deleted ADMIN_EMAILS");
}

await api(`/v10/projects/${projectId}/env`, {
  method: "POST",
  body: JSON.stringify({
    key: "ADMIN_EMAILS",
    value: adminEmails,
    type: "plain",
    target: ["production", "preview", "development"],
  }),
});

console.log("set ADMIN_EMAILS =", adminEmails);
console.log("Redeploy production in Vercel to apply (or wait for next deploy).");