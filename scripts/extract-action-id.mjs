import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/extract-action-id.mjs <bundle.js>");
  process.exit(1);
}

const source = fs.readFileSync(file, "utf8");
const matches = [...source.matchAll(/createServerReference\("([a-f0-9]+)"/g)];
console.log(matches.map((match) => match[1]).join("\n"));