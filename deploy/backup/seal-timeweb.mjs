// Manual operator utility. Uses the running app's loopback DB bridge; never starts the app.
import { createCipheriv, createHash, createPublicKey, publicEncrypt, randomBytes, constants } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants as fsConstants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const TABLE = "public.skm_backup_sealed_capture_07b0dad5";
export const REQUIRED = Object.freeze([
  "AUTH_SECRET", "ADMIN_TOTP_SECRETS", "SKM_SITE_ADMIN_EMAIL", "SKM_TIMEWEB_PROXY_PEERS",
  "SKM_DB_JUMP_HOST", "SKM_DB_JUMP_FINGERPRINT", "SKM_DB_HOME_FINGERPRINT",
  "SKM_DB_JUMP_KEY_BASE64", "SKM_DB_HOME_KEY_BASE64",
]);
export const ALLOWED = Object.freeze([
  ...REQUIRED, "ADMIN_EMAIL", "ADMIN_EMAILS", "SKM_DB_JUMP_PORT", "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_CONTACT_REQUESTS_ENABLED", "SKM_CONSENT_SOURCE_UTC_VERIFIED",
  "SKM_WEB_BIND_HOST", "PORT", "NODE_ENV",
]);

export const SOURCE_VERSION = "tanitsu-maintained-source-v1";
export const SOURCE_DIRS = Object.freeze(["app", "components", "lib", "scripts", "migrations", "deploy", "tests"]);
export const SOURCE_ROOT_FILES = Object.freeze([
  "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "tailwind.config.ts",
  "postcss.config.mjs", "eslint.config.mjs", "components.json", "proxy.ts",
]);
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".sql", ".py",
  ".sh", ".service", ".timer", ".conf", ".sudoers", ".toml", ".yaml", ".yml",
]);
const EXCLUDED_DIRS = new Set([".git", ".next", "node_modules", "__pycache__", ".cache", "coverage", "generated", "private", "docs"]);
const RELEASE_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/** No Git, environment capture or network access; the inventory is identical on CRLF/LF checkouts. */
export function sourceDigest(root) {
  const paths = [];
  function inspect(filename) {
    const stat = lstatSync(filename);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("invalid_source_entry");
    return stat;
  }
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const filename = path.join(directory, name);
      const stat = inspect(filename);
      if (name.startsWith(".env")) continue;
      if (stat.isDirectory()) {
        if (!EXCLUDED_DIRS.has(name)) walk(filename);
      } else if (SOURCE_EXTENSIONS.has(path.extname(name))) paths.push(filename);
    }
  }
  if (!inspect(root).isDirectory()) throw new Error("invalid_source_root");
  for (const name of SOURCE_DIRS) {
    const directory = path.join(root, name);
    if (!inspect(directory).isDirectory()) throw new Error("missing_source_directory");
    walk(directory);
  }
  for (const name of SOURCE_ROOT_FILES) {
    const filename = path.join(root, name);
    if (!inspect(filename).isFile()) throw new Error("missing_source_file");
    paths.push(filename);
  }
  if (paths.length > 10000) throw new Error("source_limit");
  let bytes = 0;
  const inventory = paths.map(filename => {
    const before = inspect(filename);
    if (!before.isFile() || before.size > 16 * 1024 * 1024) throw new Error("source_limit");
    const fd = openSync(filename, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    let normalized;
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev) throw new Error("source_changed");
      const data = readFileSync(fd);
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
      normalized = Buffer.from(text.replace(/\r\n?/g, "\n"), "utf8");
      const after = fstatSync(fd);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("source_changed");
    } finally { closeSync(fd); }
    bytes += normalized.length;
    if (bytes > 64 * 1024 * 1024) throw new Error("source_limit");
    return [path.relative(root, filename).split(path.sep).join("/"), createHash("sha256").update(normalized).digest("hex")];
  }).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const digest = createHash("sha256").update(SOURCE_VERSION + "\n" + JSON.stringify(inventory) + "\n").digest("hex");
  return { sourceDigest: digest, sourceInventory: SOURCE_VERSION, files: inventory.length };
}

export function verifySource(root, { verifiedRelease, verifiedSourceDigest } = {}) {
  if (verifiedRelease !== undefined && !RELEASE_PATTERN.test(verifiedRelease)) throw new Error("invalid_release");
  if (verifiedSourceDigest !== undefined && !DIGEST_PATTERN.test(verifiedSourceDigest)) throw new Error("invalid_source_digest");
  let metadata;
  try { metadata = lstatSync(path.join(root, ".git")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (metadata && (metadata.isSymbolicLink() || (!metadata.isFile() && !metadata.isDirectory()))) throw new Error("invalid_git_metadata");
  let release;
  if (metadata) {
    const git = args => execFileSync("git", args, {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, windowsHide: true,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LANG: "C" },
    }).trim();
    try {
      const top = git(["rev-parse", "--show-toplevel"]);
      if (realpathSync(top) !== realpathSync(root)) throw new Error("wrong_git_root");
      release = git(["rev-parse", "HEAD"]);
      if (!RELEASE_PATTERN.test(release)) throw new Error("invalid_release");
    } catch (error) { if (error.code !== "ENOENT" || error.path !== "git") throw error; }
  }
  if (!release && (!verifiedRelease || !verifiedSourceDigest)) throw new Error("verified_release_and_digest_required");
  const source = sourceDigest(root);
  if (verifiedSourceDigest && verifiedSourceDigest !== source.sourceDigest) throw new Error("source_digest_mismatch");
  if (release && verifiedRelease && verifiedRelease !== release) throw new Error("release_mismatch");
  return {
    release: release ?? verifiedRelease, sourceDigest: source.sourceDigest,
    releaseVerification: { mode: release ? "git-head" : "operator-verified", sourceInventory: SOURCE_VERSION },
  };
}

export function parseArguments(args) {
  if (args.length === 1 && args[0] === "--source-digest") return { digestOnly: true };
  const names = { "--owner-public-spki": "publicFile", "--verified-release": "verifiedRelease", "--verified-source-digest": "verifiedSourceDigest" };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = Object.hasOwn(names, args[index]) ? names[args[index]] : undefined, value = args[index + 1];
    if (!name || Object.hasOwn(options, name) || !value || value.startsWith("--")) throw new Error("usage");
    options[name] = value;
  }
  if (!options.publicFile) throw new Error("usage");
  return options;
}

export function seal(environment, publicSpki, verification, now = new Date()) {
  const { release, sourceDigest, releaseVerification } = verification;
  if (!RELEASE_PATTERN.test(release) || !DIGEST_PATTERN.test(sourceDigest) ||
      !["git-head", "operator-verified"].includes(releaseVerification?.mode) || releaseVerification.sourceInventory !== SOURCE_VERSION) {
    throw new Error("invalid_release_verification");
  }
  for (const name of REQUIRED) {
    if (typeof environment[name] !== "string" || !environment[name].trim()) throw new Error("missing_environment");
  }
  const values = Object.fromEntries(ALLOWED.filter(name => Object.hasOwn(environment, name))
    .map(name => [name, environment[name]]));
  if (Object.values(values).some(value => typeof value !== "string" || value.length > 32768)) {
    throw new Error("invalid_environment");
  }
  // The owner file is base64-encoded DER SubjectPublicKeyInfo, not a private key.
  const encoded = publicSpki.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("invalid_public_key");
  const der = Buffer.from(encoded, "base64");
  if (der.toString("base64") !== encoded) throw new Error("invalid_public_key");
  const ownerKey = createPublicKey({ key: der, format: "der", type: "spki" });
  if (ownerKey.asymmetricKeyType !== "rsa" || ownerKey.asymmetricKeyDetails.modulusLength < 3072) {
    throw new Error("invalid_public_key");
  }
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify({ release, captured_at: now.toISOString(), sourceDigest, releaseVerification, env: values }));
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = {
      format: "tanitsu-timeweb-sealed-v1",
      algorithm: "RSA-OAEP-SHA256+A256GCM",
      key: publicEncrypt({ key: ownerKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key).toString("base64"),
      iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    const payload = JSON.stringify(envelope);
    if (Buffer.byteLength(payload) > 65536) throw new Error("sealed_limit");
    return { release, payload, sha256: createHash("sha256").update(payload).digest("hex") };
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}

export async function store(client, sealed) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    // No IF NOT EXISTS/upsert: an uncollected capture must never be replaced.
    await client.query(`CREATE TABLE ${TABLE} (id integer PRIMARY KEY CHECK(id=1), release text NOT NULL, payload text NOT NULL)`);
    await client.query(`REVOKE ALL ON ${TABLE} FROM PUBLIC`);
    await client.query(`INSERT INTO ${TABLE} (id,release,payload) VALUES (1,$1,$2)`, [sealed.release, sealed.payload]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  if (options.digestOnly) { console.log(JSON.stringify(sourceDigest(root))); return; }
  const verification = verifySource(root, options);
  const { release, sourceDigest: digest, releaseVerification } = verification;
  const sealed = seal(process.env, readFileSync(options.publicFile, "utf8"), verification);
  const client = new pg.Client({
    connectionString: "postgresql://skm_site@127.0.0.1:15432/skm_site?sslmode=disable",
    connectionTimeoutMillis: 5000, query_timeout: 20000,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    await store(client, sealed);
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({ status: "sealed", release, sourceDigest: digest, releaseVerification: releaseVerification.mode, sha256: sealed.sha256 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("skm_seal_failed");
    process.exitCode = 1;
  });
}
