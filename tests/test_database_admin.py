import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("dbadmin", Path(__file__).resolve().parents[1] / "scripts/database-admin.py")
admin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admin)


class DatabaseAdminTests(unittest.TestCase):
    def test_invalid_modes_rejected_before_connection_in_both_orders(self):
        invalid = [
            ["retention", "--apply", "--dry-run"], ["retention", "--dry-run", "--apply"],
            ["inventory", "--apply"], ["inventory", "--dry-run"],
            ["retention", "--backup", "/fixture.dump"], ["retention", "--source-utc-verified"],
        ]
        for args in invalid:
            with self.subTest(args=args), patch.object(admin, "query") as query, patch("sys.stderr"), \
                    patch("sys.argv", ["database-admin.py", *args, "--expected-database", "closure_570e5006"]):
                with self.assertRaises(SystemExit):
                    admin.main()
                query.assert_not_called()

    def test_fake_magic_archive_rejected_by_actual_pg_restore(self):
        with tempfile.TemporaryDirectory(prefix="skm-backup-test-") as directory:
            backup = Path(directory) / "fake.dump"
            backup.write_bytes(b"PGDMPnot-an-archive")
            checksum = hashlib.sha256(backup.read_bytes()).hexdigest()
            manifest = Path(directory) / "proof.json"
            proof = dict(formatVersion=1, kind="full-database", database="closure_570e5006", checksum=checksum,
                         restoreVerification=dict(status="passed", database="closure_fixture_restored", countsVerified=True, verifiedAt="2026-11-26T00:00:00Z"))
            manifest.write_text(json.dumps(proof), encoding="utf-8")
            backup.chmod(0o600)
            manifest.chmod(0o600)
            with self.assertRaises(subprocess.SubprocessError):
                admin.retire_sql(str(backup), checksum, str(manifest), "closure_570e5006",
                                 restore_command=("docker", "exec", "-i", "skm-audit-pg-20261125", "pg_restore"))
            with self.assertRaises(ValueError):
                admin.retire_sql(str(backup), checksum, str(manifest), "wrong_fixture")

    def test_retention_target_guard_precedes_advisory_lock_and_mutations(self):
        sql = admin.retention_sql(True, expected_database="closure_570e5006")
        self.assertLess(sql.index("current_database()"), sql.index("pg_advisory_xact_lock"))
        self.assertLess(sql.index("current_database()"), sql.index("DELETE"))
        with self.assertRaises(ValueError):
            admin.retention_sql(True)


if __name__ == "__main__":
    unittest.main()
