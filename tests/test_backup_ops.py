"""Local synthetic fixtures only. Native restic tests require SKM_TEST_RESTIC."""

import collections
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "deploy" / "backup"))
import backup
import common
import health
import maintenance
import ops

NOW = 1795770000
SNAPSHOT = "a" * 64
Disk = collections.namedtuple("Disk", "total used free")


def state():
    return {
        "format": 1,
        "repository_id": maintenance.REPOSITORY_ID,
        "last_success": NOW,
        "last_restore": NOW,
        "last_full_check": NOW,
        "last_run": NOW,
        "snapshot": SNAPSHOT,
        "outcome": "success",
    }


class HealthTests(unittest.TestCase):
    def assess(self, value=None, *, age=0, free=30, total=100):
        return health.assess(
            state() if value is None else value,
            NOW + age,
            Disk(total * 1024**3, 0, free * 1024**3),
        )

    def test_fresh_and_retry_buffer(self):
        self.assertEqual(self.assess(age=7 * 3600 + 3599), {})

    def test_age_warning_critical(self):
        for hours, severity in ((8, "warning"), (12, "critical")):
            self.assertEqual(self.assess(age=hours * 3600)["backup_stale"], severity)

    def test_percentage_or_absolute_disk_limits(self):
        for free, total, severity in (
            (20, 100, "warning"),
            (10, 100, "critical"),
            (2, 5, "warning"),
            (1, 5, "critical"),
        ):
            self.assertEqual(self.assess(free=free, total=total)["disk_free"], severity)

    def test_missing_invalid_outcome_future_wrong_repo(self):
        self.assertEqual(
            health.assess(None, NOW, Disk(100, 0, 100)),
            {"status_missing": "critical", "disk_free": "critical"},
        )
        for fields in (
            {"last_success": True},
            {"last_success": NOW + 61},
            {"outcome": "other"},
            {"repository_id": "b" * 64},
            {"snapshot": "latest"},
        ):
            with self.subTest(fields=fields):
                self.assertIn("status_invalid", self.assess({**state(), **fields}))
        self.assertIn("backup_failed", self.assess({**state(), "outcome": "failed"}))
        self.assertNotIn(
            "backup_running", self.assess({**state(), "outcome": "running"})
        )
        self.assertIn(
            "backup_running", self.assess({**state(), "outcome": "running"}, age=2700)
        )

    def test_old_restore(self):
        self.assertIn(
            "restore_stale",
            self.assess({**state(), "last_restore": NOW - 8 * 86400 - 1}),
        )

    def test_dedup_escalation_daily_recovery(self):
        events, active = health.notice_plan({}, {"backup_stale": "warning"}, NOW)
        self.assertEqual(events, ["backup_stale:warning"])
        self.assertEqual(
            health.notice_plan(active, {"backup_stale": "warning"}, NOW + 86399)[0], []
        )
        self.assertEqual(
            health.notice_plan(active, {"backup_stale": "warning"}, NOW + 86400)[0],
            events,
        )
        self.assertEqual(
            health.notice_plan(active, {"backup_stale": "critical"}, NOW + 1)[0],
            ["backup_stale:critical"],
        )
        self.assertEqual(
            health.notice_plan(active, {}, NOW + 1), (["backup_stale:recovered"], {})
        )

    def test_unit_failure_and_inactive_timer(self):
        healthy = b"LoadState=loaded\nActiveState=inactive\nResult=success\nExecMainStatus=0\n"
        with patch.object(health, "run", return_value=healthy):
            self.assertEqual(set(health.units_health()), {"unit_1", "unit_3"})
        with patch.object(health, "run", side_effect=common.Failure("command_failed")):
            self.assertEqual(len(health.units_health()), 4)

    def test_active_disabled_timer_is_not_persistent_health(self):
        enabled = b"LoadState=loaded\nActiveState=active\nResult=success\nExecMainStatus=0\nUnitFileState=enabled\n"
        with patch.object(health, "run", return_value=enabled):
            self.assertEqual(health.units_health(), {})
        with patch.object(
            health, "run", return_value=enabled.replace(b"enabled", b"disabled")
        ):
            self.assertEqual(set(health.units_health()), {"unit_1", "unit_3"})

    def test_collect_maintenance_missing_invalid_failed_stale(self):
        cases = [
            (FileNotFoundError(), "maintenance_missing"),
            ({}, "maintenance_invalid"),
            ({"format": 1, "last_run": NOW, "outcome": "failed"}, "maintenance_failed"),
            (
                {
                    "format": 1,
                    "last_run": NOW,
                    "outcome": "success",
                    "last_success": NOW - 8 * 86400 - 1,
                },
                "maintenance_stale",
            ),
        ]
        with tempfile.TemporaryDirectory() as temporary:
            status = Path(temporary) / "status.json"
            status.write_text("{}")
            for value, expected in cases:
                with (
                    patch.object(backup, "STATUS", status),
                    patch.object(health, "read_json", side_effect=[state(), value]),
                    patch.object(health, "units_health", return_value={}),
                    patch.object(
                        health.shutil,
                        "disk_usage",
                        return_value=Disk(100 * 1024**3, 0, 30 * 1024**3),
                    ),
                ):
                    self.assertIn(expected, health.collect(NOW))

    def test_tls_and_recipient_credential_path(self):
        fake_password = type(
            "Password",
            (),
            {
                "stat": lambda _: type("Stat", (), {"st_size": 16})(),
                "read_text": lambda _: "synthetic-only\n",
            },
        )()
        with (
            patch.object(
                health, "read_json", return_value={"smtp_user": "fixture@yandex.ru"}
            ),
            patch.object(health, "protected", return_value=fake_password),
            patch.dict(os.environ, {"CREDENTIALS_DIRECTORY": str(health.CREDENTIALS)}),
            patch.object(health.smtplib, "SMTP_SSL") as smtp,
        ):
            smtp.return_value.__enter__.return_value.send_message.return_value = {}
            health.send(["selftest:requested"])
            args, kwargs = smtp.call_args
            self.assertEqual(args, ("smtp.yandex.ru", 465))
            self.assertTrue(kwargs["context"].check_hostname)
            self.assertEqual(kwargs["context"].verify_mode, health.ssl.CERT_REQUIRED)
            message = (
                smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
            )
            self.assertEqual(message["To"], "i@ooo-skmoscow.ru")
            self.assertNotIn("synthetic-only", message.as_string())
        with (
            patch.object(
                health, "read_json", return_value={"smtp_user": "fixture@yandex.ru"}
            ),
            patch.dict(os.environ, {"CREDENTIALS_DIRECTORY": "/wrong/unit"}),
            self.assertRaises(common.Failure),
        ):
            health.send(["selftest:requested"])

    def test_send_failure_does_not_advance_state(self):
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.object(health, "ROOT", Path(temporary)),
            patch.object(health, "protected"),
            patch.object(health.os, "geteuid", return_value=123),
            patch.object(health, "exclusive") as lock,
            patch.object(health, "load_notifications", return_value={}),
            patch.object(health, "collect", return_value={"backup_failed": "critical"}),
            patch.object(health, "send", side_effect=RuntimeError("synthetic")),
            patch.object(health, "atomic_json") as save,
            patch.object(sys, "argv", ["health.py"]),
        ):
            lock.return_value.__enter__.return_value = True
            with self.assertRaises(RuntimeError):
                health.main()
            save.assert_not_called()

    def test_dry_run_neither_sends_nor_writes(self):
        with (
            patch.object(health, "protected"),
            patch.object(health.os, "geteuid", return_value=123),
            patch.object(health, "collect"),
            patch.object(health, "send") as send,
            patch.object(health, "exclusive") as lock,
            patch.object(health, "atomic_json") as save,
            patch.object(sys, "argv", ["health.py", "--dry-run"]),
        ):
            health.main()
            send.assert_not_called()
            save.assert_not_called()
            lock.assert_not_called()

    def test_test_notification_has_no_fake_failure_or_state_write(self):
        with (
            patch.object(health, "protected"),
            patch.object(health.os, "geteuid", return_value=123),
            patch.object(health, "exclusive") as lock,
            patch.object(health, "atomic_json") as save,
            patch.object(health, "collect") as collect,
            patch.object(health, "send") as send,
            patch.object(sys, "argv", ["health.py", "--test-notification"]),
        ):
            lock.return_value.__enter__.return_value = True
            health.main()
            send.assert_called_once_with(["selftest:requested"])
            save.assert_not_called()
            collect.assert_not_called()


class MaintenanceTests(unittest.TestCase):
    def test_dry_main_no_status_write(self):
        with (
            patch.object(maintenance.os, "geteuid", return_value=123),
            patch.object(maintenance, "context", return_value={}),
            patch.object(maintenance, "exclusive") as lock,
            patch.object(maintenance, "read_json", return_value=state()),
            patch.object(maintenance, "cycle") as cycle,
            patch.object(maintenance, "atomic_json") as save,
            patch.object(sys, "argv", ["maintenance.py", "--dry-run"]),
        ):
            lock.return_value.__enter__.return_value = True
            maintenance.main()
            self.assertTrue(cycle.call_args.kwargs["dry_run"])
            self.assertTrue(lock.call_args.kwargs["existing"])
            save.assert_not_called()

    def test_busy_main_does_not_read_status_or_run(self):
        with (
            patch.object(maintenance.os, "geteuid", return_value=123),
            patch.object(maintenance, "context", return_value={}),
            patch.object(maintenance, "exclusive") as lock,
            patch.object(maintenance, "read_json") as read,
            patch.object(maintenance, "cycle") as cycle,
            patch.object(maintenance, "atomic_json") as save,
            patch.object(sys, "argv", ["maintenance.py"]),
        ):
            lock.return_value.__enter__.return_value = False
            maintenance.main()
            read.assert_not_called()
            cycle.assert_not_called()
            save.assert_not_called()

    def test_stale_failed_or_wrong_repository_never_commands(self):
        for fields in (
            {"outcome": "failed"},
            {"outcome": "running"},
            {"repository_id": "b" * 64},
            {"last_success": NOW - 8 * 3600 - 1},
            {"last_restore": NOW - 8 * 86400 - 1},
            {"last_success": NOW + 61},
            {"last_full_check": 0},
        ):
            with (
                patch.object(maintenance, "command") as command,
                self.assertRaises(common.Failure),
            ):
                maintenance.cycle({}, {**state(), **fields}, NOW)
            command.assert_not_called()

    def test_check_failure_prevents_prune(self):
        with (
            patch.object(maintenance, "identity"),
            patch.object(maintenance, "snapshot_ids", return_value={SNAPSHOT}),
            patch.object(
                maintenance, "command", side_effect=common.Failure("command_failed")
            ) as command,
            self.assertRaises(common.Failure),
        ):
            maintenance.cycle({}, state(), NOW)
        self.assertEqual(command.call_count, 1)
        self.assertEqual(command.call_args.args[1], "check")

    def test_snapshot_set_change_fails(self):
        with (
            patch.object(maintenance, "identity"),
            patch.object(
                maintenance,
                "snapshot_ids",
                side_effect=[{SNAPSHOT}, {SNAPSHOT, "b" * 64}],
            ),
            patch.object(maintenance, "command"),
            self.assertRaises(common.Failure),
        ):
            maintenance.cycle({}, state(), NOW)

    def test_failed_cycle_writes_failed_status(self):
        with (
            patch.object(maintenance.os, "geteuid", return_value=123),
            patch.object(maintenance, "context", return_value={}),
            patch.object(maintenance, "exclusive") as lock,
            patch.object(maintenance, "read_json", return_value=state()),
            patch.object(maintenance, "cycle", side_effect=RuntimeError("synthetic")),
            patch.object(maintenance, "atomic_json") as save,
            patch.object(sys, "argv", ["maintenance.py"]),
        ):
            lock.return_value.__enter__.return_value = True
            with self.assertRaises(RuntimeError):
                maintenance.main()
            self.assertEqual(save.call_args.args[1]["outcome"], "failed")

    def test_atomic_failure_preserves_old_state(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(ops, "protected"):
            target = Path(temporary) / "state.json"
            ops.atomic_json(target, {"old": True})
            with (
                patch.object(ops.os, "replace", side_effect=OSError("synthetic")),
                self.assertRaises(OSError),
            ):
                ops.atomic_json(target, {"old": False})
            self.assertEqual(json.loads(target.read_bytes()), {"old": True})
            self.assertEqual([p.name for p in target.parent.iterdir()], ["state.json"])
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_real_cross_process_lock_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "backup.lock"
            with ops.exclusive(target) as acquired:
                self.assertTrue(acquired)
                code = "import sys;sys.path.insert(0,sys.argv[1]);import ops;\nwith ops.exclusive(sys.argv[2]) as ok: sys.exit(9 if ok else 0)"
                result = subprocess.run(
                    [
                        sys.executable,
                        "-c",
                        code,
                        str(Path(ops.__file__).parent),
                        str(target),
                    ],
                    capture_output=True,
                    timeout=10,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
            alias = Path(temporary) / "alias"
            alias.symlink_to(target)
            with self.assertRaises(OSError), ops.exclusive(alias):
                pass


@unittest.skipUnless(os.environ.get("SKM_TEST_RESTIC"), "verified restic required")
class RealMaintenanceTests(unittest.TestCase):
    def test_garbage_prune_dryrun_wrong_repo_and_retained_restore(self):
        binary = os.environ["SKM_TEST_RESTIC"]
        self.assertEqual(
            hashlib.sha256(Path(binary).read_bytes()).hexdigest(),
            "c109579d3a1a4d26094bef5400ac5645fceb1043414c05f51b8fb48272001c72",
        )
        with tempfile.TemporaryDirectory(prefix="skm-prune-synthetic-") as temporary:
            root = Path(temporary)
            repo = root / "repository"
            password = root / "password"
            password.write_text("synthetic-test-only-not-real")
            env = {
                **common.ENV,
                "RESTIC_PASSWORD_FILE": str(password),
                "GOMEMLIMIT": "96MiB",
                "GOGC": "50",
            }
            args = [binary, "--repo", str(repo), "--no-cache"]
            execute = lambda *argv, **kw: common.run(
                [*args, *argv], env=env, timeout=60, **kw
            )
            execute("init")
            repo_id = json.loads(execute("cat", "config"))["id"]
            payload = root / "retained.bin"
            retained = os.urandom(1024 * 1024)
            payload.write_bytes(retained)
            execute("backup", "--host", "synthetic-only", str(payload))
            kept = json.loads(execute("snapshots", "--json"))[0]["id"]
            payload.write_bytes(os.urandom(3 * 1024 * 1024))
            execute("backup", "--host", "synthetic-only", str(payload))
            garbage = next(
                row["id"]
                for row in json.loads(execute("snapshots", "--json"))
                if row["id"] != kept
            )
            execute("forget", garbage)
            current = {**state(), "repository_id": repo_id, "snapshot": kept}

            def inventory():
                return {
                    str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in repo.rglob("*")
                    if p.is_file()
                }

            with (
                patch.object(backup, "RESTIC", binary),
                patch.object(backup, "REPO", repo),
                patch.object(maintenance, "REPOSITORY_ID", repo_id),
            ):
                before = inventory()
                maintenance.cycle(env, current, NOW, dry_run=True)
                self.assertEqual(inventory(), before, "dry-run changed repository")
                with (
                    patch.object(maintenance, "REPOSITORY_ID", "f" * 64),
                    self.assertRaises(common.Failure),
                ):
                    maintenance.cycle(env, {**current, "repository_id": "f" * 64}, NOW)
                self.assertEqual(inventory(), before, "wrong repo mutated repository")
                size_before = sum(
                    p.stat().st_size for p in repo.rglob("*") if p.is_file()
                )
                maintenance.cycle(env, current, NOW)
                size_after = sum(
                    p.stat().st_size for p in repo.rglob("*") if p.is_file()
                )
                self.assertLess(size_after, size_before - 2 * 1024 * 1024)
                self.assertEqual(maintenance.snapshot_ids(env, False), {kept})
                target = root / "restored"
                execute("restore", kept, "--target", str(target))
                restored = target / str(payload).lstrip("/")
                self.assertEqual(restored.read_bytes(), retained)
                self.assertLess(
                    sum(p.stat().st_size for p in root.rglob("*") if p.is_file()),
                    64 * 1024 * 1024,
                )


if __name__ == "__main__":
    unittest.main()
