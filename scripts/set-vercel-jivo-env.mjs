/**
 * Sets NEXT_PUBLIC_JIVO_WIDGET_ID on Vercel and triggers production deploy.
 * Usage: VERCEL_TOKEN=vcp_... JIVO_WIDGET_ID=xxxxx node scripts/set-vercel-jivo-env.mjs
 */
const token = process.env.VERCEL_TOKEN?.trim();
const teamId = "team_nstO9w8Wx3tj5AraxnVpmPj3";
const projectId = "prj_mlbGcFrIHd35fvgLXRAzXm3kwhqN";
const widgetId = process.env.JIVO_WIDGET_ID?.trim() ?? process.env.NEXT_PUBLIC_JIVO_WIDGET_ID?.trim();

if (!token) {
  console.error("Set VERCEL_TOKEN");
  process.exit(1);
}

if (!widgetId) {
  console.error("Set JIVO_WIDGET_ID or NEXT_PUBLIC_JIVO_WIDGET_ID");
  process.exit(1);
}

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
const byKey = new Map((envs.envs ?? []).map((entry) => [entry.key, entry]));

const tawkKeys = [
  "NEXT_PUBLIC_TAWK_PROPERTY_ID",
  "NEXT_PUBLIC_TAWK_WIDGET_ID",
  "NEXT_PUBLIC_TAWK_ENABLED",
  "NEXT_PUBLIC_TAWK_AUTH_ONLY",
];

for (const key of tawkKeys) {
  const existing = byKey.get(key);
  if (!existing) continue;
  await api(`/v9/projects/${projectId}/env/${existing.id}`, { method: "DELETE" });
  console.log(`deleted ${key}`);
}

const jivoKey = "NEXT_PUBLIC_JIVO_WIDGET_ID";
const existingJivo = byKey.get(jivoKey);
if (existingJivo) {
  await api(`/v9/projects/${projectId}/env/${existingJivo.id}`, { method: "DELETE" });
  console.log(`deleted ${jivoKey}`);
}

await api(`/v10/projects/${projectId}/env`, {
  method: "POST",
  body: JSON.stringify({
    key: jivoKey,
    value: widgetId,
    type: "plain",
    target: ["production", "preview", "development"],
  }),
});
console.log(`set ${jivoKey} =`, widgetId);

const deployment = await api(`/v13/deployments`, {
  method: "POST",
  body: JSON.stringify({
    name: "skm-industrial-demo",
    project: projectId,
    target: "production",
    gitSource: {
      type: "github",
      org: "tanitsu-reberu",
      repo: "skm-industrial-demo",
      ref: "main",
    },
  }),
});

console.log("deployment:", deployment.url, deployment.readyState, deployment.id);