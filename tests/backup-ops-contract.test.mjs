import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = name => fs.readFileSync(new URL("../deploy/backup/" + name, import.meta.url), "utf8");
const fields = text => Object.fromEntries(text.split(/\r?\n/).filter(line => /^[A-Za-z]+=/.test(line))
  .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));

test("health is the only SMTP credential unit; maintenance stays bounded and shares lock", () => {
  const health = fields(read("skm-site-backup-health.service"));
  const maintenance = fields(read("skm-site-backup-maintenance.service"));
  const backup = fields(read("skm-site-backup.service"));
  assert.equal(health.LoadCredential, "smtp-password:/etc/skm-site-backup/health-smtp-password");
  assert.equal(maintenance.LoadCredential, "restic-password:/etc/skm-site-backup/restic-password");
  for (const unit of [backup, maintenance]) assert.equal(unit.OnFailure, "skm-site-backup-health.service");
  assert.equal(health.StateDirectory, "skm-site-backup-health");
  assert.equal(health.ReadOnlyPaths, "/var/lib/skm-site-backup");
  assert.equal(maintenance.MemoryMax, "256M");
  assert.equal(maintenance.MemorySwapMax, "0");
  assert.equal(maintenance.RestrictAddressFamilies, "AF_UNIX");
  assert.equal(maintenance.User, "skm_site_backup");
  assert.equal(maintenance.ExecStart, "/usr/bin/python3 -I /opt/skm-site-backup/maintenance.py");
  assert.equal(health.ExecStart, "/usr/bin/python3 -I /opt/skm-site-backup/health.py");
  assert.equal(fields(read("skm-site-backup-health.timer")).OnCalendar, "*-*-* *:00/15:00");
  assert.equal(fields(read("skm-site-backup-maintenance.timer")).OnCalendar, "Sun *-*-* 04:30:00 UTC");
  assert(read("maintenance.py").includes('backup.ROOT / "backup.lock"'));
  for (const forbidden of ['"init"', '"unlock"', '"repair"', '"forget"']) assert(!read("maintenance.py").includes(forbidden));
  assert(!read("skm-site-backup.service").includes("smtp-password"));
});

test("baseline core backup, source and restore stay unchanged across checkout line endings", () => {
  for (const name of ["backup.py", "source.py", "restore.py"]) {
    const baseline = execFileSync("git", ["show", `f4d98f4:deploy/backup/${name}`], { cwd: root, windowsHide: true });
    const current = fs.readFileSync(new URL("../deploy/backup/" + name, import.meta.url));
    const hash = data => createHash("sha256").update(data.toString().replaceAll("\r\n", "\n")).digest("hex");
    assert.equal(hash(current), hash(baseline), name);
  }
});

test("shared protocol has only the authorized migration 003 compatibility changes", () => {
  const baseline = execFileSync("git", ["show", "f4d98f4:deploy/backup/common.py"], { cwd: root, windowsHide: true }).toString().replaceAll("\r\n", "\n");
  const expected = baseline.replace('    "recovery/timeweb-recovery.enc": "/etc/skm-site-backup/timeweb-recovery.enc",\n',
    '    "recovery/timeweb-recovery.enc": "/etc/skm-site-backup/timeweb-recovery.enc",\n    "recovery/003-service-uploads.sql": "/opt/skm-site-maintenance/migrations/003-service-uploads.sql",\n')
    .replace('    for name, meta in files.items():\n', '    require("service_uploads" not in counts or "recovery/003-service-uploads.sql" in files,\n            "missing_uploads_migration")\n    for name, meta in files.items():\n');
  assert.equal(read("common.py").replaceAll("\r\n", "\n"), expected);
});

test("runbook keeps readable public config, private credential, real unit selftest and package decrypt proof", () => {
  const procedure = read("OPERATIONS.md");
  for (const required of ["root0644", "root0600", "90-selftest.conf", "--test-notification",
    "/run/credentials/skm-site-backup-health.service", "O_EXCL", "fsync", "skm-site-export.lock",
    'manifest.files["recovery/timeweb-recovery.enc"].sha256', "28/30/8/12",
    "c109579d3a1a4d26094bef5400ac5645fceb1043414c05f51b8fb48272001c72"]) {
    assert(procedure.includes(required), required);
  }
  assert.equal(JSON.parse(read("health.example.json")).smtp_user, "REPLACE_WITH_EXISTING_YANDEX_SMTP_LOGIN");
});
