import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const expected = ["backup.py", "common.py", "forced.py", "restore.py", "source.py"]
  .map(name => "deploy/backup/" + name);

function git(args, env = process.env) {
  const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8", windowsHide: true });
  assert.ifError(result.error);
  return result;
}

test("only the dedicated backup directory bypasses the global Python ignore", () => {
  const files = fs.readdirSync(path.join(root, "deploy", "backup"))
    .filter(name => name.endsWith(".py")).map(name => "deploy/backup/" + name).sort();
  assert.deepEqual(files, expected);
  for (const name of [...expected, "scripts/contact-mailer.py", "scripts/database-admin.py", "tests/fixture.py"]) {
    assert.equal(git(["check-ignore", "--no-index", "--quiet", "--", name]).status, 1, name + " must be packageable");
  }
  for (const name of ["private-helper.py", "scripts/private-helper.py", "deploy/private-helper.py",
    "deploy/backup/private/private-helper.py"]) {
    assert.equal(git(["check-ignore", "--no-index", "--quiet", "--", name]).status, 0, name + " must remain ignored");
  }
});

test("ordinary git add includes all five production Python files in an isolated index", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "skm-packaging-index-"));
  const index = path.join(temporary, "index");
  const env = { ...process.env, GIT_INDEX_FILE: index, GIT_OPTIONAL_LOCKS: "0" };
  try {
    assert.equal(git(["rev-parse", "--git-path", "index"], env).stdout.trim().replaceAll("\\", "/"),
      index.replaceAll("\\", "/"));
    // Start empty so a later commit containing these files cannot mask an ignore regression.
    const baseline = git(["read-tree", "--empty"], env);
    assert.equal(baseline.status, 0, baseline.stderr);
    const added = git(["add", "--", "deploy/backup"], env);
    assert.equal(added.status, 0, added.stderr);
    const listed = git(["ls-files", "--cached", "--", "deploy/backup"], env);
    assert.equal(listed.status, 0, listed.stderr);
    const python = listed.stdout.trim().split(/\r?\n/).filter(name => name.endsWith(".py")).sort();
    assert.deepEqual(python, expected);
    const stages = git(["ls-files", "--stage", "--", ...expected], env);
    assert.equal(stages.status, 0, stages.stderr);
    const entries = stages.stdout.trim().split(/\r?\n/);
    assert.equal(entries.length, 5);
    assert(entries.every(line => /^100644 [0-9a-f]{40,64} 0\tdeploy\/backup\/[^/]+\.py$/.test(line)));
  } finally {
    const resolved = path.resolve(temporary);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert(path.basename(resolved).startsWith("skm-packaging-index-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
