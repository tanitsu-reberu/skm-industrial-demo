import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

export function expectedDatabaseName(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error("Explicit expected database required");
  return value;
}

export async function assertExpectedDatabase(client, expectedDatabase) {
  expectedDatabaseName(expectedDatabase);
  const row = (await client.query("SELECT current_database() AS database")).rows[0];
  if (row.database !== expectedDatabase) throw new Error("Connected database differs from explicit expected database");
}

async function regularPrivateInput(filename) {
  if (!filename || !path.isAbsolute(filename)) throw new Error("Absolute local backup/manifest required");
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== "win32" && (stat.mode & 0o022))) {
    throw new Error("Backup/manifest must be regular, not symlinked or writable by other users");
  }
}

export async function verifyBackup({ backup, checksum, manifest, expectedDatabase,
  restoreCommand = ["pg_restore"] } = {}) {
  expectedDatabaseName(expectedDatabase);
  if (!/^[a-f0-9]{64}$/.test(checksum ?? "")) throw new Error("Expected backup SHA256 required");
  await regularPrivateInput(backup);
  await regularPrivateInput(manifest);
  const proof = JSON.parse(await fs.readFile(manifest, "utf8"));
  if (proof.formatVersion !== 1 || proof.kind !== "full-database" || proof.database !== expectedDatabase || proof.checksum !== checksum ||
      proof.restoreVerification?.status !== "passed" || proof.restoreVerification?.countsVerified !== true ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(proof.restoreVerification?.database ?? "") ||
      !Number.isFinite(Date.parse(proof.restoreVerification?.verifiedAt ?? ""))) throw new Error("Backup provenance/restore proof does not match expected database");
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(backup)) digest.update(chunk);
  if (digest.digest("hex") !== checksum) throw new Error("Backup checksum mismatch");
  // Parse the actual archive through pg_restore, not a five-byte magic check.
  const listing = await new Promise((resolve, reject) => {
    const child = spawn(restoreCommand[0], [...restoreCommand.slice(1), "--list"], {
      stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; if (output.length > 8 * 1024 * 1024) child.kill(); });
    child.stderr.resume();
    child.on("error", () => reject(new Error("Could not validate backup with pg_restore")));
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error("Invalid pg_restore archive")));
    const input = createReadStream(backup);
    input.on("error", () => child.kill());
    child.stdin.on("error", () => input.destroy());
    child.once("close", () => input.destroy());
    input.pipe(child.stdin);
  });
  const source = /^;\s+dbname:\s*(\S+)\s*$/m.exec(listing)?.[1];
  if (source !== expectedDatabase) throw new Error("Archive source database does not match explicit target");
}
