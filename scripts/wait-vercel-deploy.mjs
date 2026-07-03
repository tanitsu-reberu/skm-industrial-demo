const token = process.env.VERCEL_TOKEN?.trim();
const teamId = "team_nstO9w8Wx3tj5AraxnVpmPj3";
const deploymentId = process.argv[2];

if (!token || !deploymentId) {
  console.error("Usage: VERCEL_TOKEN=... node scripts/wait-vercel-deploy.mjs <deploymentId>");
  process.exit(1);
}

for (let attempt = 0; attempt < 30; attempt += 1) {
  const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${teamId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  console.log(JSON.stringify({ state: data.readyState, url: data.url, alias: data.alias }));
  if (data.readyState === "READY" || data.readyState === "ERROR" || data.readyState === "CANCELED") {
    process.exit(data.readyState === "READY" ? 0 : 1);
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
}

process.exit(1);