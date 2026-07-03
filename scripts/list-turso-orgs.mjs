import { createClient } from "@tursodatabase/api";

const apiToken = process.env.TURSO_API_TOKEN;
if (!apiToken) {
  console.error("Set TURSO_API_TOKEN");
  process.exit(1);
}

const turso = createClient({ token: apiToken });
const orgs = await turso.organizations.list();
console.log(JSON.stringify(orgs, null, 2));