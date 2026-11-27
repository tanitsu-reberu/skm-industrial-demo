import assert from "node:assert/strict";
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ALLOWED, REQUIRED, SOURCE_DIRS, SOURCE_ROOT_FILES, SOURCE_VERSION, TABLE, parseArguments, seal, sourceDigest, store, verifySource } from "../deploy/backup/seal-timeweb.mjs";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const release = "f".repeat(40);
const verification = { release, sourceDigest: "a".repeat(64), releaseVerification: { mode: "operator-verified", sourceInventory: SOURCE_VERSION } };
const environment = Object.fromEntries(REQUIRED.map(name => [name, "synthetic-" + name]));
const hasGit = spawnSync("git", ["--version"], { windowsHide: true }).status === 0;

test("sealed capture decrypts with owner key and contains only allowlisted values plus actual release", () => {
  const captured = seal({ ...environment, PATH: "excluded", UNRELATED_SECRET: "excluded" }, spki, verification);
  assert.equal(captured.release, release);
  assert.match(captured.sha256, /^[0-9a-f]{64}$/);
  assert(!captured.payload.includes("synthetic-"));
  const encrypted = JSON.parse(captured.payload);
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(encrypted.key, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const recovered = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]));
  assert.equal(recovered.release, release);
  assert.equal(recovered.sourceDigest, verification.sourceDigest);
  assert.deepEqual(recovered.releaseVerification, verification.releaseVerification);
  assert.match(recovered.captured_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(recovered.env, environment);
  assert(Object.keys(recovered.env).every(name => ALLOWED.includes(name)));
  assert.notEqual(seal(environment, spki, verification).payload, captured.payload);
  const altered = Buffer.from(encrypted.ciphertext, "base64");
  altered[0] ^= 1;
  const rejected = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  rejected.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  rejected.update(altered);
  assert.throws(() => rejected.final(), "tampered ciphertext must fail authentication");
});

test("operator CLI logs only a fixed error with incomplete synthetic environment", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "skm-seal-synthetic-"));
  try {
    const publicFile = path.join(temporary, "public-spki.txt");
    fs.writeFileSync(publicFile, spki);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../deploy/backup/seal-timeweb.mjs", import.meta.url)),
      "--owner-public-spki", publicFile], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, AUTH_SECRET: "SYNTHETIC_MUST_NOT_LOG" },
      encoding: "utf8", windowsHide: true, timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), "skm_seal_failed");
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert(path.basename(temporary).startsWith("skm-seal-synthetic-"));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("seal refuses missing environment, weak key, wrong release, oversized capture", () => {
  for (const name of REQUIRED) assert.throws(() => seal({ ...environment, [name]: "" }, spki, verification));
  assert.throws(() => seal(environment, spki, { ...verification, release: "operator-label" }));
  const weak = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
  assert.throws(() => seal(environment, weak, verification));
  assert.throws(() => seal({ ...environment, AUTH_SECRET: "s".repeat(32769) }, spki, verification));
  assert.throws(() => seal(environment, "private key", verification));
  assert.throws(() => seal(environment, spki, { ...verification, sourceDigest: "short" }));
  assert.throws(() => seal(environment, spki, { ...verification, releaseVerification: { mode: "unverified", sourceInventory: SOURCE_VERSION } }));
});

test("scratch capture is transactional, fixed name, parameterized, and refuses replacement", async () => {
  const calls = [];
  const sealed = seal(environment, spki, verification);
  const client = { query: async (...args) => calls.push(args) };
  await store(client, sealed);
  assert.equal(calls[0][0], "BEGIN");
  assert.equal(calls.at(-1)[0], "COMMIT");
  const create = calls.find(([sql]) => sql.startsWith("CREATE TABLE"))[0];
  assert(create.includes(TABLE));
  assert(!create.includes("IF NOT EXISTS"));
  const insert = calls.find(([sql]) => sql.startsWith("INSERT"));
  assert.deepEqual(insert[1], [release, sealed.payload]);
  assert(!insert[0].includes(sealed.payload));
  const failed = [];
  await assert.rejects(store({ query: async sql => {
    failed.push(sql);
    if (sql.startsWith("CREATE TABLE")) throw new Error("synthetic existing capture");
  } }, sealed));
  assert.equal(failed.at(-1), "ROLLBACK");
  assert(!failed.includes("COMMIT"));
});

function withSourceFixture(run) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "skm-seal-source-"));
  try {
    for (const name of SOURCE_DIRS) {
      fs.mkdirSync(path.join(temporary, name));
      fs.writeFileSync(path.join(temporary, name, "fixture.mjs"), "export const value = 1;\n");
    }
    for (const name of SOURCE_ROOT_FILES) fs.writeFileSync(path.join(temporary, name), "{}\n");
    return run(temporary);
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert(path.basename(temporary).startsWith("skm-seal-source-"));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function git(root, args) {
  const config = path.join(root, ".synthetic-git-config");
  if (!fs.existsSync(config)) fs.writeFileSync(config, "");
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LANG: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: config } }).trim();
}

function commitFixture(root) {
  git(root, ["init", "--quiet"]);
  git(root, ["-c", "core.autocrlf=false", "add", "."]);
  git(root, ["-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "commit", "--quiet", "-m", "synthetic fixture"]);
  return git(root, ["rev-parse", "HEAD"]);
}

test("source inventory is path-stable and normalizes LF/CRLF/CR across maintained text", () => withSourceFixture(root => {
  const first = sourceDigest(root);
  // Interoperability vector independently calculated with Python hashlib + compact JSON.
  assert.equal(first.sourceDigest, "b3d282cbab9fceeeb1f183c6697564b2e1f87e419d7f674d5d81acd8d033da90");
  assert.equal(first.files, SOURCE_DIRS.length + SOURCE_ROOT_FILES.length);
  for (const directory of SOURCE_DIRS) fs.writeFileSync(path.join(root, directory, "fixture.mjs"), "export const value = 1;\r\n");
  for (const name of SOURCE_ROOT_FILES) fs.writeFileSync(path.join(root, name), "{}\r");
  assert.deepEqual(sourceDigest(root), first);
  fs.writeFileSync(path.join(root, "app", "fixture.mjs"), "export const value = 2;\n");
  assert.notEqual(sourceDigest(root).sourceDigest, first.sourceDigest);
  fs.writeFileSync(path.join(root, "app", "fixture.mjs"), "export const value = 1;\n");
  fs.writeFileSync(path.join(root, "lib", "new.ts"), "export {};\n");
  assert.notEqual(sourceDigest(root).sourceDigest, first.sourceDigest, "new maintained files participate");
}));

test("generated, private, docs, environment, root artifacts and binary bytes are not read as source", () => withSourceFixture(root => {
  const first = sourceDigest(root);
  const invalid = Buffer.from([0xff, 0xfe, 0x00]);
  for (const directory of ["private", "docs", "generated", "node_modules", "__pycache__", ".next", ".cache", "coverage"]) {
    fs.mkdirSync(path.join(root, "tests", directory));
    fs.writeFileSync(path.join(root, "tests", directory, "excluded.json"), invalid);
  }
  for (const name of [".env", ".env.production", ".env.synthetic.json", "README.md", "image.png", "cache.pyc"]) {
    fs.writeFileSync(path.join(root, "scripts", name), invalid);
  }
  fs.writeFileSync(path.join(root, "next-env.d.ts"), invalid);
  fs.mkdirSync(path.join(root, ".next")); fs.writeFileSync(path.join(root, ".next", "bundle.js"), invalid);
  assert.deepEqual(sourceDigest(root), first);
  fs.writeFileSync(path.join(root, "lib", "invalid.ts"), invalid);
  assert.throws(() => sourceDigest(root), /encoded data|encoding/i);
}));

test("missing mandatory roots/files and source symlinks are rejected", () => withSourceFixture(root => {
  const digest = sourceDigest(root).sourceDigest;
  for (const name of [...SOURCE_DIRS, ...SOURCE_ROOT_FILES]) {
    const current = path.join(root, name), hidden = path.join(root, name + ".held");
    fs.renameSync(current, hidden);
    try { assert.throws(() => sourceDigest(root)); } finally { fs.renameSync(hidden, current); }
  }
  const target = path.join(root, "target"); fs.mkdirSync(target);
  fs.symlinkSync(target, path.join(root, "app", "docs"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => sourceDigest(root), /invalid_source_entry/, "even an excluded-name symlink must be refused");
  fs.symlinkSync(target, path.join(root, ".git"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifySource(root, { verifiedRelease: release, verifiedSourceDigest: digest }), /invalid_git_metadata/);
}));

test("special source entries are rejected without opening them", { skip: process.platform === "win32" && "FIFO fixture is POSIX-only" }, () => withSourceFixture(root => {
  execFileSync("mkfifo", [path.join(root, "tests", "special.ts")]);
  assert.throws(() => sourceDigest(root), /invalid_source_entry/);
}));

test("no metadata fallback requires BOTH verified flags and matching actual source digest", () => withSourceFixture(root => {
  const digest = sourceDigest(root).sourceDigest;
  for (const flags of [{}, { verifiedRelease: release }, { verifiedSourceDigest: digest }]) {
    assert.throws(() => verifySource(root, flags), /verified_release_and_digest_required/);
  }
  const flags = { verifiedRelease: release, verifiedSourceDigest: digest };
  assert.deepEqual(verifySource(root, flags), { release, sourceDigest: digest, releaseVerification: { mode: "operator-verified", sourceInventory: SOURCE_VERSION } });
  assert.throws(() => verifySource(root, { ...flags, verifiedSourceDigest: "0".repeat(64) }), /source_digest_mismatch/);
  fs.writeFileSync(path.join(root, "app", "fixture.mjs"), "export const value = 3;\n");
  assert.throws(() => verifySource(root, flags), /source_digest_mismatch/);
  for (const invalid of ["f4d98f4", "f".repeat(39), "F".repeat(40), "label", "g".repeat(40)]) {
    assert.throws(() => verifySource(root, { ...flags, verifiedRelease: invalid }), /invalid_release/);
  }
  assert.throws(() => verifySource(root, { ...flags, verifiedSourceDigest: "a".repeat(63) }), /invalid_source_digest/);
}));

test("real Git HEAD remains authoritative and checks every optional supplied assertion", {
  skip: !hasGit && "Real Git fixture requires an installed binary",
}, () => withSourceFixture(root => {
  const actualRelease = commitFixture(root), digest = sourceDigest(root).sourceDigest;
  const expected = { release: actualRelease, sourceDigest: digest, releaseVerification: { mode: "git-head", sourceInventory: SOURCE_VERSION } };
  assert.deepEqual(verifySource(root), expected);
  assert.deepEqual(verifySource(root, { verifiedRelease: actualRelease }), expected);
  assert.deepEqual(verifySource(root, { verifiedSourceDigest: digest }), expected);
  assert.deepEqual(verifySource(root, { verifiedRelease: actualRelease, verifiedSourceDigest: digest }), expected);
  assert.throws(() => verifySource(root, { verifiedRelease: "0".repeat(40) }), /release_mismatch/);
  assert.throws(() => verifySource(root, { verifiedSourceDigest: "0".repeat(64) }), /source_digest_mismatch/);
  const prior = process.env.PATH;
  try {
    process.env.PATH = root;
    assert.throws(() => verifySource(root, { verifiedRelease: actualRelease }), /verified_release_and_digest_required/);
    const fallback = verifySource(root, { verifiedRelease: actualRelease, verifiedSourceDigest: digest });
    assert.equal(fallback.releaseVerification.mode, "operator-verified");
    assert.equal(fallback.release, actualRelease);
  } finally { process.env.PATH = prior; }
}));

test("available Git refuses corrupt metadata rather than an operator override", { skip: !hasGit && "Repository validation needs the real Git binary" }, () => withSourceFixture(root => {
  fs.mkdirSync(path.join(root, ".git"));
  const digest = sourceDigest(root).sourceDigest;
  assert.throws(() => verifySource(root, { verifiedRelease: release, verifiedSourceDigest: digest }));
}));

test("CLI options are explicit, reject unknown/duplicate flags and expose a source-only digest mode", () => {
  assert.deepEqual(parseArguments(["--source-digest"]), { digestOnly: true });
  assert.deepEqual(parseArguments(["--owner-public-spki", "public.txt", "--verified-release", release, "--verified-source-digest", "a".repeat(64)]),
    { publicFile: "public.txt", verifiedRelease: release, verifiedSourceDigest: "a".repeat(64) });
  for (const args of [[], ["--source-digest", "--owner-public-spki", "x"], ["--owner-public-spki"],
    ["--owner-public-spki", "x", "--owner-public-spki", "y"], ["--owner-public-spki", "x", "constructor", "y"],
    ["--owner-public-spki", "x", "--unknown", "y"]]) assert.throws(() => parseArguments(args), /usage/);
});
