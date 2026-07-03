const token = process.env.VERCEL_TOKEN?.trim();
const teamId = "team_nstO9w8Wx3tj5AraxnVpmPj3";
const projectId = "prj_mlbGcFrIHd35fvgLXRAzXm3kwhqN";

if (!token) {
  console.error("Set VERCEL_TOKEN");
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

const updates = [
  ["OTP_FROM_EMAIL", "SKM <no-reply@service-skm.ru>", "plain"],
  ["RESEND_API_KEY", "re_UVyfHpuR_P2jEjxtkQJcyXQn57kDDBhbW", "encrypted"],
  ["TURSO_DATABASE_URL", "libsql://skm-industrial-demo-tanitsu-reberu.aws-eu-west-1.turso.io", "plain"],
  [
    "TURSO_AUTH_TOKEN",
    "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODMwODgxMDIsImtpZCI6IjhZUVJhSjJGaWZ3dUtNNVF6UEJOSjJqNk52Y1dIREdoaHNwcFJsdWlGUU0iLCJwIjp7InJ3Ijp7Im5zIjpbIjAxOWYyODU1LTM4MDEtNzI0My05OWQ4LWYyYTYxYjIxZGE3YiJdfX0sInJpZCI6IjJmZjQwYzcxLTIyYzYtNGQzYy1iODBjLTIwYTgxYTkxOWUxZiJ9.hhHQPxzBrx2YmBq8P82u0wEZD5XcMzhA5GeGSLvO-Jma7DhU2e-rRCY3jmBxYS1HEm7Odb42CmoPGkYsTECzAg",
    "encrypted",
  ],
];

for (const [key, value, type] of updates) {
  const existing = byKey.get(key);
  if (existing) {
    await api(`/v9/projects/${projectId}/env/${existing.id}`, { method: "DELETE" });
    console.log(`deleted ${key}`);
  }

  await api(`/v10/projects/${projectId}/env`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type,
      target: ["production", "preview", "development"],
    }),
  });
  console.log(`set ${key}`);
}

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