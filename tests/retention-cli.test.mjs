import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parseRetentionArgs } from "../scripts/data-retention.mjs";

test("conflicting maintenance modes fail before database connection, in either argument order", () => {
  const target = "--expected-database=closure_570e5006";
  const archive = `--archive=${path.resolve("fixture.dump")}`;
  for (const args of [
    ["--apply", "--dry-run"], ["--dry-run", "--apply"], ["--inventory", "--apply"],
    ["--inventory", "--dry-run"], [archive, "--apply"], [archive, "--dry-run"], [archive, "--inventory"],
    ["--retire-empty-legacy", "--apply", "--inventory"], ["--backup=/fixture.dump"],
    ["--apply", "--apply"], ["--expected-database=other_fixture"],
  ]) {
    assert.throws(() => parseRetentionArgs([...args, target]));
    const result = spawnSync(process.execPath, ["--require", path.resolve("tests/no-db-connect.cjs"), "scripts/data-retention.mjs", ...args, target], {
      env: { ...process.env, POSTGRES_URL: "postgresql://fixture@127.0.0.1:1/closure_570e5006" }, encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert(!result.stderr.includes("UNEXPECTED_DATABASE_CONNECTION"));
  }
  assert.equal(parseRetentionArgs([target, "--dry-run"]).apply, false);
  assert.equal(parseRetentionArgs([target, "--apply"]).apply, true);
});
