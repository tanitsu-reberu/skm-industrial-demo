"""Synthetic Linux-only backup tests; no production socket, SSH or real credentials."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

BACKUP = Path(__file__).resolve().parents[1] / "deploy" / "backup"
sys.path.insert(0, str(BACKUP))
import common
import backup
import source
import restore
import forced


def fixture():
    data = {name: b"synthetic-recovery-content" for name in common.REQUIRED_FILES}
    data["database.dump"] = b"PGDMPsynthetic-only"
    manifest = {"format": 1, "database": "skm_site", "snapshot": "00000001-00000002-1",
                "counts": {"services": 12, "users": 1, "contact_requests": 5, "@sent": 5},
                "files": {name: {"size": len(body), "sha256": hashlib.sha256(body).hexdigest()}
                          for name, body in data.items()}}
    return manifest, data


def archive_bytes(manifest=None, data=None, extra=None):
    if manifest is None:
        manifest, data = fixture()
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for name, body in [("manifest.json", common.json_bytes(manifest)), *data.items()]:
            member = tarfile.TarInfo(name)
            member.size = len(body)
            tar.addfile(member, io.BytesIO(body))
        if extra:
            member, body = extra
            tar.addfile(member, io.BytesIO(body))
    return result.getvalue()


class ArchiveTests(unittest.TestCase):
    def parse(self, content):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "database.dump"
            result = backup.validate_archive(io.BytesIO(content), target)
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), ["database.dump"])
            self.assertTrue(target.read_bytes().startswith(b"PGDMP"))
            return result

    def test_valid_archive_stores_only_dump(self):
        self.assertEqual(self.parse(archive_bytes())["counts"]["@sent"], 5)

    def test_optional_opaque_package_not_extracted(self):
        manifest, data = fixture()
        name = "recovery/timeweb-recovery.enc"
        data[name] = b"opaque-never-decrypt"
        manifest["files"][name] = {"size": len(data[name]), "sha256": hashlib.sha256(data[name]).hexdigest()}
        self.assertIn(name, self.parse(archive_bytes(manifest, data))["files"])

    def test_links_traversal_absolute_duplicate_and_special_rejected(self):
        cases = [("../outside", tarfile.REGTYPE), ("/root/outside", tarfile.REGTYPE),
                 ("database.dump", tarfile.REGTYPE), ("database.dump", tarfile.SYMTYPE),
                 ("database.dump", tarfile.LNKTYPE), ("database.dump", tarfile.FIFOTYPE),
                 ("database.dump", tarfile.CHRTYPE), ("unknown", tarfile.REGTYPE)]
        for name, kind in cases:
            with self.subTest(name=name, kind=kind):
                member = tarfile.TarInfo(name)
                member.type, member.linkname = kind, "../../outside"
                with self.assertRaises(common.Failure):
                    self.parse(archive_bytes(extra=(member, b"")))

    def test_checksum_mismatch_rejected(self):
        manifest, data = fixture()
        data["recovery/smtp-password"] = b"wrong-content-same-or-different-length"
        with self.assertRaises(common.Failure):
            self.parse(archive_bytes(manifest, data))

    def test_missing_recovery_file_rejected(self):
        manifest, data = fixture()
        del data["recovery/smtp-password"]
        with self.assertRaises(common.Failure):
            self.parse(archive_bytes(manifest, data))

    def test_unbounded_member_rejected_before_read(self):
        content = io.BytesIO()
        with tarfile.open(fileobj=content, mode="w") as tar:
            member = tarfile.TarInfo("database.dump")
            member.size = common.MAX_DUMP + 1
            tar.addfile(member)  # header only: parser must refuse before reading claimed content
        with self.assertRaises(common.Failure):
            self.parse(content.getvalue())

    def test_nonzero_trailing_bytes_rejected(self):
        with self.assertRaises(common.Failure):
            self.parse(archive_bytes() + b"hidden-entry")

    def test_truncated_archive_rejected(self):
        with self.assertRaises((common.Failure, tarfile.TarError)):
            self.parse(archive_bytes()[:800])

    def test_wrong_database_and_count_shapes_rejected(self):
        for mutation in ({"database": "skm_scada"}, {"counts": {"@sent": -1}},
                         {"counts": {"@sent": True}}, {"files": {"../../escape": {}}}):
            manifest, data = fixture()
            manifest.update(mutation)
            with self.subTest(mutation=mutation), self.assertRaises(common.Failure):
                self.parse(archive_bytes(manifest, data))


class FrameTests(unittest.TestCase):
    def test_round_trip_excludes_smtp_and_opaque_data(self):
        manifest, data = fixture()
        data["recovery/smtp-password"] = b"TEST-ONLY-SMTP-CONTENT-NEVER-IN-FRAME"
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "original.dump"
            original.write_bytes(data["database.dump"])
            output = io.BytesIO()
            common.write_frame(output, manifest, original)
            self.assertNotIn(data["recovery/smtp-password"], output.getvalue())
            recovered = Path(tmp) / "restored.dump"
            self.assertEqual(common.read_frame(io.BytesIO(output.getvalue()), recovered), manifest)
            self.assertEqual(recovered.read_bytes(), original.read_bytes())

    def test_frame_truncation_checksum_and_trailing_bytes(self):
        manifest, data = fixture()
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "original.dump"
            original.write_bytes(data["database.dump"])
            output = io.BytesIO()
            common.write_frame(output, manifest, original)
            frame = output.getvalue()
            for index, altered in enumerate((frame[:-1], frame + b"extra", frame[:-1] + b"X", b"wrong")):
                with self.subTest(index=index), self.assertRaises(common.Failure):
                    common.read_frame(io.BytesIO(altered), Path(tmp) / str(index))

    def test_count_mismatch(self):
        restore.compare_counts({"users": 1}, {"users": 1})
        with self.assertRaises(common.Failure):
            restore.compare_counts({"users": 1}, {"users": 2})

    def test_sql_identifiers_not_caller_sql(self):
        for tables in (["users; DROP DATABASE skm_scada"], ["users", "users"], [], ["x"] * 65):
            with self.assertRaises(common.Failure):
                common.counts_sql(tables)


class CycleTests(unittest.TestCase):
    def setUp(self):
        self.state = {"format": 1, "last_success": 0, "last_restore": 0, "last_full_check": 0}
        self.config = {"repository_id": "a" * 64, "restic_version": "0.20.0"}
        self.calls, self.saved = [], []
        self.preflight = patch.object(backup, "preflight").start()
        patch.object(backup, "save_status", side_effect=lambda s: self.saved.append(dict(s))).start()
        self.verify = patch.object(backup, "check_snapshot").start()
        patch.object(backup, "restic", side_effect=self.restic).start()
        self.addCleanup(patch.stopall)

    def restic(self, env, *args, **kwargs):
        self.calls.append(args)
        if args[0] == "backup":
            return common.json_bytes({"message_type": "summary", "snapshot_id": "b" * 64}) + b"\n"
        return b""

    def cycle(self, **kwargs):
        return backup.cycle(self.config, {}, ["ssh-synthetic"], self.state, now=2000000, **kwargs)

    def test_first_backup_forces_actual_restore_before_forget(self):
        self.cycle()
        self.assertEqual([call[0] for call in self.calls], ["backup", "check", "forget"])
        self.assertIn("--stdin-from-command", self.calls[0])
        self.assertNotIn("--stdin", self.calls[0])
        self.verify.assert_called_once_with({}, "b" * 64, ["ssh-synthetic"], True)
        self.assertEqual(self.state["last_restore"], 2000000)
        self.assertEqual(self.state["outcome"], "success")
        self.assertNotIn("prune", str(self.calls))

    def test_failed_partial_export_does_not_verify_forget_or_update_success(self):
        with patch.object(backup, "restic", side_effect=common.Failure("command_failed")):
            with self.assertRaises(common.Failure):
                self.cycle()
        self.verify.assert_not_called()
        self.assertEqual(self.state["last_success"], 0)
        self.assertEqual(self.state["outcome"], "failed")
        self.assertTrue(self.state["stale"])

    def test_restore_failure_never_forgets(self):
        self.verify.side_effect = common.Failure("count_mismatch")
        with self.assertRaises(common.Failure):
            self.cycle()
        self.assertNotIn("forget", [c[0] for c in self.calls])
        self.assertEqual(self.state["last_restore"], 0)

    def test_full_check_failure_never_restores_or_forgets(self):
        original = self.restic
        def fail(env, *args, **kwargs):
            if args[0] == "check":
                raise common.Failure("command_failed")
            return original(env, *args, **kwargs)
        with patch.object(backup, "restic", side_effect=fail), self.assertRaises(common.Failure):
            self.cycle()
        self.verify.assert_not_called()
        self.assertEqual([c[0] for c in self.calls], ["backup"])

    def test_dry_run_no_backup_restore_status_or_actual_delete(self):
        self.cycle(dry_run=True)
        self.assertEqual([c[0] for c in self.calls], ["forget"])
        self.assertIn("--dry-run", self.calls[0])
        self.assertEqual(self.saved, [])
        self.verify.assert_not_called()

    def test_wrong_status_repo_stops_before_any_command(self):
        self.state["repository_id"] = "c" * 64
        with self.assertRaises(common.Failure):
            self.cycle()
        self.assertEqual(self.calls, [])
        self.preflight.assert_not_called()

    def test_recheck_id_failure_before_forget_preserves_last_success(self):
        self.preflight.side_effect = [None, common.Failure("wrong_repository_id")]
        with self.assertRaises(common.Failure):
            self.cycle()
        self.assertNotIn("forget", [c[0] for c in self.calls])
        self.assertEqual(self.state["last_success"], 0)

    def test_skip_fresh_and_force_despite_fresh(self):
        self.state.update(last_success=1999990, last_restore=1999990, last_full_check=1999990)
        self.cycle()
        self.assertEqual(self.calls, [])
        self.assertEqual(self.state["outcome"], "skipped")
        self.cycle(force=True)
        self.verify.assert_called_once_with({}, "b" * 64, ["ssh-synthetic"], True)

    def test_weekly_restore_due_even_with_recent_daily_checks(self):
        self.state.update(last_success=1900000, last_restore=1, last_full_check=1999990)
        self.cycle()
        self.assertTrue(self.verify.call_args.args[-1])

    def test_nonweekly_verifies_all_contents_without_pg_or_full_check(self):
        self.state.update(last_success=1900000, last_restore=1900000, last_full_check=1900000)
        self.cycle()
        self.assertEqual([c[0] for c in self.calls], ["backup", "forget"])
        self.assertFalse(self.verify.call_args.args[-1])


class BoundaryTests(unittest.TestCase):
    def test_sshd_match_templates_use_only_reviewed_match_directives(self):
        # Global-only directives such as PermitUserEnvironment are invalid even after Match all.
        allowed = {"authenticationmethods", "passwordauthentication", "kbdinteractiveauthentication",
                   "authorizedkeysfile", "forcecommand", "disableforwarding", "permittty",
                   "allowagentforwarding", "x11forwarding", "permituserrc", "allowtcpforwarding",
                   "allowstreamlocalforwarding", "gatewayports", "permitlisten", "permitopen",
                   "permittunnel"}
        for filename in ("source-sshd.conf", "offsite-sshd.conf"):
            with self.subTest(filename=filename):
                in_match = False
                directives = []
                for line in (BACKUP / filename).read_text().splitlines():
                    line = line.split("#", 1)[0].strip()
                    if not line:
                        continue
                    keyword = line.split()[0].lower()
                    directives.append(keyword)
                    if keyword == "match":
                        in_match = True
                    elif in_match:
                        self.assertIn(keyword, allowed, filename + ": " + line)
                self.assertTrue(in_match)
                self.assertIn("forcecommand", directives)
                self.assertNotIn("permituserenvironment", directives)

    @unittest.skipUnless(os.geteuid() == 0, "real UID-switch permission check needs local root")
    def test_root_owned_config_readable_by_unprivileged_service_uid(self):
        # Native /run avoids NTFS permission emulation and world-writable /tmp ancestry.
        with tempfile.TemporaryDirectory(prefix="skm-config-permissions-", dir="/run") as tmp:
            directory = Path(tmp)
            directory.chmod(0o755)
            module = directory / "common.py"
            module.write_bytes((BACKUP / "common.py").read_bytes())
            module.chmod(0o644)
            config = directory / "client.json"
            config.write_bytes(common.json_bytes({"repository_id": "a" * 64,
                                                   "restic_version": "0.20.0",
                                                   "restic_binary": "/opt/skm-site-backup/bin/restic"}))
            config.chmod(0o644)
            code = ("import json,sys; sys.path.insert(0," + repr(str(directory)) + "); "
                    "from common import protected; "
                    "config=json.loads(protected(" + repr(str(config)) + ").read_bytes()); "
                    "assert config['repository_id']==" + repr("a" * 64))
            def read_as_service_uid():
                return subprocess.run([sys.executable, "-I", "-c", code], user=65534, group=65534,
                                      extra_groups=[], env=common.ENV, capture_output=True, timeout=5)
            self.assertEqual(read_as_service_uid().returncode, 0)
            config.chmod(0o600)
            self.assertNotEqual(read_as_service_uid().returncode, 0)
            config.chmod(0o666)
            self.assertNotEqual(read_as_service_uid().returncode, 0)
            config.chmod(0o644)
            directory.chmod(0o700)
            self.assertNotEqual(read_as_service_uid().returncode, 0)

    def test_preflight_rejects_unsupported_cli_and_wrong_id(self):
        config = {"repository_id": "a" * 64, "restic_version": "0.20.0"}
        for version, help_text, repo in ((b"restic 0.16.4 x", b"", {}),
                                          (b"restic 0.20.0 x", b"--stdin", {}),
                                          (b"restic 0.20.0 x", b"--stdin-from-command", {"id": "b" * 64})):
            with self.subTest(version=version, help=help_text):
                with patch.object(backup, "run", side_effect=[version, help_text]), \
                     patch.object(backup, "restic", return_value=common.json_bytes(repo)), \
                     self.assertRaises(common.Failure):
                    backup.preflight(config, {})

    def test_wrong_target_refused_before_path_read(self):
        with patch.object(backup, "protected") as inspect:
            with self.assertRaises(common.Failure):
                backup.repository_guard("/var/lib/other-app/repository", "a" * 64)
            inspect.assert_not_called()

    def test_symlink_and_writable_config_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            target = base / "target"
            target.write_text("synthetic")
            (base / "link").symlink_to(target)
            # /tmp is world-writable: protected rejects the ancestry as well.
            for path in (base / "link", target):
                with self.assertRaises(common.Failure):
                    common.protected(path, owner=os.geteuid())

    def test_forced_dispatch_rejects_shell_argv_and_env_injection(self):
        for command in ("export; id", " export", "export ", "verify\n", "PGHOST=evil export", "_export", ""):
            with patch.dict(os.environ, {"SSH_ORIGINAL_COMMAND": command}, clear=True), \
                 patch.object(sys, "argv", ["forced.py"]), patch.object(os, "execve") as execute, \
                 patch.object(os, "write"):
                self.assertEqual(forced.main(), 1)
                execute.assert_not_called()
        with patch.dict(os.environ, {"SSH_ORIGINAL_COMMAND": "export"}, clear=True), \
             patch.object(sys, "argv", ["forced.py", "extra"]), patch.object(os, "write"):
            self.assertEqual(forced.main(), 1)

    def test_forced_dispatch_sanitizes_environment_and_exact_argv(self):
        with patch.dict(os.environ, {"SSH_ORIGINAL_COMMAND": "verify", "PGHOST": "evil",
                                     "PYTHONPATH": "evil", "RESTIC_PASSWORD": "TEST-ONLY"}, clear=True), \
             patch.object(sys, "argv", ["forced.py"]), patch.object(os, "execve") as execute:
            forced.main()
            argv, env = execute.call_args.args[1:]
            self.assertEqual(argv, ["sudo", "-n", "/usr/bin/python3", "-I", "/opt/skm-site-backup/source.py", "verify"])
            self.assertNotIn("PGHOST", env)
            self.assertNotIn("RESTIC_PASSWORD", env)

    def test_no_raw_exception_or_subprocess_stderr_logged(self):
        with patch.object(os, "write") as log:
            def fail():
                raise RuntimeError("TEST-ONLY-SECRET SQL SMTP PASSWORD")
            self.assertEqual(common.safe_main(fail), 1)
            log.assert_called_once_with(2, b"skm_backup_failed\n")
        with self.assertRaises(common.Failure) as raised:
            common.run([sys.executable, "-c", "import sys; sys.stderr.write('TEST-ONLY-SECRET'); sys.exit(9)"])
        self.assertNotIn("TEST-ONLY-SECRET", str(raised.exception))

    def test_timeout_kills_process_group_bounded(self):
        start = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired):
            common.run([sys.executable, "-c", "import time; time.sleep(30)"], timeout=0.1)
        self.assertLess(time.monotonic() - start, 3)

    def test_atomic_status_and_failure_preserves_age(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(backup, "ROOT", Path(tmp)), \
             patch.object(backup, "STATUS", Path(tmp) / "status.json"):
            state = {"format": 1, "last_success": 1, "last_restore": 1, "last_full_check": 1,
                     "outcome": "failed", "stale": True}
            backup.save_status(state)
            self.assertEqual(json.loads(backup.STATUS.read_bytes()), state)
            self.assertEqual(backup.STATUS.stat().st_mode & 0o777, 0o600)
            self.assertEqual([p.name for p in Path(tmp).iterdir()], ["status.json"])


class SnapshotTests(unittest.TestCase):
    def test_valid_tar_with_failed_restic_dump_producer_never_restores(self):
        real_tempdir = tempfile.TemporaryDirectory
        with real_tempdir() as tmp:
            root = Path(tmp)
            payload = root / "synthetic.tar"
            payload.write_bytes(archive_bytes())
            producer = root / "producer"
            producer.write_text("#!/usr/bin/python3\nimport sys\n"
                                "sys.stdout.buffer.write(open(" + repr(str(payload)) + ", 'rb').read())\n"
                                "sys.stdout.buffer.flush()\nsys.exit(9)\n")
            producer.chmod(0o700)
            runtime = root / "runtime"
            runtime.mkdir(mode=0o700)
            with patch.object(backup, "RESTIC", str(producer)), patch.object(backup, "RUNTIME", runtime), \
                 patch.object(backup, "run") as verifier, self.assertRaises(common.Failure):
                backup.check_snapshot(common.ENV, "a" * 64, ["ssh-synthetic"], True)
            verifier.assert_not_called()
            self.assertEqual(list(runtime.iterdir()), [])

    def test_restore_count_failure_always_stops_cluster_and_cleans_files(self):
        manifest, data = fixture()
        real_tempdir = tempfile.TemporaryDirectory
        calls = []
        with real_tempdir() as tmp:
            root = Path(tmp)
            original = root / "original.dump"
            original.write_bytes(data["database.dump"])
            frame = io.BytesIO()
            common.write_frame(frame, manifest, original)
            stage_root = root / "runtime"
            stage_root.mkdir(mode=0o700)
            def stage(**kwargs): return real_tempdir(prefix="check-", dir=stage_root)
            def fake_run(argv, **kwargs):
                calls.append(argv)
                if argv[0].endswith("initdb"):
                    Path(argv[argv.index("-D") + 1]).mkdir()
                if argv[0].endswith("psql"):
                    if b"pg_tables" in kwargs.get("input", b""):
                        return common.json_bytes(["services", "users", "contact_requests"])
                    return common.json_bytes({**manifest["counts"], "users": 2})
                return b""
            with patch.object(restore.os, "geteuid", return_value=12345), \
                 patch.object(restore.tempfile, "TemporaryDirectory", side_effect=stage), \
                 patch.object(restore, "run", side_effect=fake_run), self.assertRaises(common.Failure):
                restore.restore(io.BytesIO(frame.getvalue()))
            self.assertEqual(calls[-1][-1], "stop")
            self.assertIn("immediate", calls[-1])
            self.assertFalse(any(c[0].endswith("pg_amcheck") for c in calls))
            self.assertEqual(list(stage_root.iterdir()), [])

    def test_real_psql_protocol_one_holder_readonly_snapshot_and_counts(self):
        # Real subprocess + pipes, synthetic protocol peer, no database connection.
        fake = """import sys,json
for line in sys.stdin:
    if 'current_database()' in line: print('skm_site')
    elif 'pg_export_snapshot()' in line: print('00000001-00000002-1')
    elif 'FROM pg_tables' in line: print(json.dumps(['services','users','contact_requests']))
    elif 'json_object_agg' in line: print(json.dumps({'services':12,'users':1,'contact_requests':5,'@sent':5}))
    elif line.startswith('\\\\echo '): print(line.split()[1])
    elif line.startswith('\\\\q'): break
    sys.stdout.flush()
"""
        with patch.object(source, "PSQL", [sys.executable, "-u", "-c", fake]):
            with source.Snapshot() as snapshot:
                self.assertEqual(snapshot.snapshot, "00000001-00000002-1")
                self.assertEqual(snapshot.counts["services"], 12)
                self.assertIsNone(snapshot.proc.poll())
            self.assertEqual(snapshot.proc.returncode, 0)

    def test_export_uses_snapshot_and_finishes_before_streaming_cleanup_on_failure(self):
        manifest, data = fixture()
        events = []
        class Holder:
            snapshot = "00000001-00000002-1"
            counts = manifest["counts"]
            def __enter__(self):
                events.append("holder_open")
                return self
            def query(self, _): events.append("holder_checked")
            def __exit__(self, *_): events.append("holder_closed")
        real_tempdir = tempfile.TemporaryDirectory
        with real_tempdir() as tmp:
            base = Path(tmp)
            def stage(**kwargs): return real_tempdir(prefix="export-", dir=base)
            def fail_dump(argv, **kwargs):
                self.assertIn("--snapshot=" + Holder.snapshot, argv)
                self.assertIn("--lock-wait-timeout=5s", argv)
                kwargs["stdout"].write(b"PGDMPpartial")
                raise common.Failure("command_failed")
            output = io.BytesIO()
            with patch.object(source.tempfile, "TemporaryDirectory", side_effect=stage), \
                 patch.object(source, "Snapshot", Holder), patch.object(source, "run", side_effect=fail_dump):
                with self.assertRaises(common.Failure):
                    source.export(output)
            self.assertEqual(output.getvalue(), b"")
            self.assertEqual(list(base.iterdir()), [])
            self.assertEqual(events, ["holder_open", "holder_closed"])

    def test_restore_unit_fixed_paths_swap_and_no_live_socket(self):
        proof = b'{"status":"passed","counts_verified":true,"amcheck":"passed"}\n'
        with patch.object(source, "run", return_value=proof) as execute, \
             patch.object(source.sys, "stdout", type("Output", (), {"buffer": io.BytesIO()})()):
            source.verify()
        argv = execute.call_args.args[0]
        self.assertIn("--property=MemorySwapMax=0", argv)
        self.assertIn("--property=User=skm_site_restore", argv)
        self.assertIn("--property=RestrictAddressFamilies=AF_UNIX", argv)
        self.assertIn("--property=RuntimeMaxSec=12min", argv)
        self.assertTrue(any("InaccessiblePaths=/var/run/postgresql" in arg for arg in argv))
        self.assertEqual(argv[-2:], ["-I", "/opt/skm-site-backup/restore.py"])


@unittest.skipUnless(os.environ.get("SKM_TEST_RESTIC"), "set SKM_TEST_RESTIC to verified local test binary")
class RealResticTests(unittest.TestCase):
    def test_real_partial_producer_failure_cannot_commit_snapshot(self):
        binary = os.environ["SKM_TEST_RESTIC"]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            password = root / "password"
            password.write_text("synthetic-test-only-not-a-real-secret")
            env = {**common.ENV, "RESTIC_PASSWORD_FILE": str(password), "GOMEMLIMIT": "96MiB"}
            repo = root / "repository"
            argv = [binary, "--repo", str(repo), "--no-cache"]
            common.run([*argv, "init"], env=env)
            common.run([binary, "backup", "--help"], env=env)
            with self.assertRaises(common.Failure):
                common.run([*argv, "backup", "--stdin-from-command", "--stdin-filename", "export.tar", "--",
                            sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'partial tar'); sys.exit(7)"], env=env)
            self.assertEqual(json.loads(common.run([*argv, "snapshots", "--json"], env=env)), [])
            common.run([*argv, "backup", "--stdin-from-command", "--stdin-filename", "export.tar", "--",
                        sys.executable, "-c", "print('complete synthetic stream')"], env=env)
            self.assertEqual(len(json.loads(common.run([*argv, "snapshots", "--json"], env=env))), 1)


if __name__ == "__main__":
    unittest.main()
