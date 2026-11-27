"""Fixed root exporter/isolated verifier; never holds a restic key."""
import fcntl
import json
import os
from pathlib import Path
import re
import resource
import signal
import selectors
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (DATABASE, ENV, PG, MAX_DUMP, MAX_FILE, MAX_MANIFEST, MAX_ARCHIVE, REQUIRED_FILES,
                    OPTIONAL_FILES, Failure, counts_sql, digest, json_bytes, protected,
                    require, run, safe_main, TABLES_SQL, validate_manifest)

PSQL = ["/usr/sbin/runuser", "-u", "postgres", "--", PG + "psql", "-X", "-qAt",
        "-v", "ON_ERROR_STOP=1", "-h", "/var/run/postgresql", "-d", DATABASE]


class Snapshot:
    """psql keeps the exporting transaction alive until the validated dump finishes."""
    def __enter__(self):
        self.proc = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, env=ENV, bufsize=0,
                                     start_new_session=True)
        try:
            self.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; "
                       "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='180s'; "
                       "SET LOCAL idle_in_transaction_session_timeout='300s';")
            require(self.query("SELECT current_database();") == DATABASE, "wrong_database")
            self.snapshot = self.query("SELECT pg_export_snapshot();")
            require(re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", self.snapshot), "invalid_snapshot")
            tables = json.loads(self.query(TABLES_SQL))
            self.counts = json.loads(self.query(counts_sql(tables)))
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def query(self, sql):
        marker = "SKM_END_" + uuid.uuid4().hex
        self.proc.stdin.write((sql + "\n\\echo " + marker + "\n").encode())
        self.proc.stdin.flush()
        output = bytearray()
        deadline = time.monotonic() + 200
        with selectors.DefaultSelector() as sel:
            sel.register(self.proc.stdout, selectors.EVENT_READ)
            while time.monotonic() < deadline:
                require(bool(sel.select(max(0, deadline - time.monotonic()))), "snapshot_timeout")
                chunk = os.read(self.proc.stdout.fileno(), 65536)
                require(bool(chunk), "snapshot_failed")
                output.extend(chunk)
                require(len(output) <= MAX_MANIFEST, "output_limit")
                if output.endswith((marker + "\n").encode()):
                    return bytes(output[:-len(marker)-1]).decode().strip()
        raise Failure("snapshot_timeout")

    def __exit__(self, *_):
        try:
            if self.proc.poll() is None:
                self.proc.stdin.write(b"ROLLBACK;\n\\q\n")
                self.proc.stdin.close()
                self.proc.wait(timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            import signal
            os.killpg(self.proc.pid, signal.SIGKILL)
            self.proc.wait(timeout=10)
        finally:
            self.proc.stdout.close()
            if not self.proc.stdin.closed:
                self.proc.stdin.close()


def export(output):
    with tempfile.TemporaryDirectory(prefix="export-", dir="/run/skm-site-export") as tmp:
        stage = Path(tmp)
        os.chmod(stage, 0o700)
        dump = stage / "database.dump"
        with Snapshot() as snapshot:
            with dump.open("xb") as target:
                run(["/usr/sbin/runuser", "-u", "postgres", "--", PG + "pg_dump", "-h",
                     "/var/run/postgresql", "-d", DATABASE, "--format=custom", "--no-password",
                     "--lock-wait-timeout=5s", "--snapshot=" + snapshot.snapshot], stdout=target)
            require(dump.stat().st_size <= MAX_DUMP, "dump_limit")
            with dump.open("rb") as src:
                require(src.read(5) == b"PGDMP", "invalid_dump")
            # postgres cannot traverse root's staging directory: list via stdin, not pathname.
            with dump.open("rb") as src:
                # The custom archive is bounded to MAX_DUMP; pg_restore --list never executes SQL.
                run([PG + "pg_restore", "--list"], input=src.read(MAX_DUMP + 1), limit=MAX_FILE)
            counts = snapshot.counts
            snapshot.query("SELECT 1;")  # abort rather than publish if the holder died during dump
        files = {"database.dump": digest(dump)}
        for name, location in {**REQUIRED_FILES, **OPTIONAL_FILES}.items():
            if name in OPTIONAL_FILES and not Path(location).exists():
                continue
            src = protected(location)
            require(0 < src.stat().st_size <= MAX_FILE, "file_limit")
            dest = stage / name
            dest.parent.mkdir(mode=0o700, exist_ok=True)
            shutil.copyfile(src, dest, follow_symlinks=False)
            os.chmod(dest, 0o600)
            files[name] = digest(dest)
        manifest = validate_manifest({"format": 1, "database": DATABASE, "counts": counts,
                                      "snapshot": snapshot.snapshot, "created_at": int(time.time()), "files": files})
        (stage / "manifest.json").write_bytes(json_bytes(manifest))
        # Fully build and validate the export before sending the first byte.
        archive = stage / "export.tar"
        with tarfile.open(archive, "w", format=tarfile.USTAR_FORMAT) as tar:
            for name in ["manifest.json", *sorted(files)]:
                info = tar.gettarinfo(str(stage / name), arcname=name)
                info.uid = info.gid = 0
                info.uname = info.gname = ""
                info.mode = 0o600
                with (stage / name).open("rb") as src:
                    tar.addfile(info, src)
        require(archive.stat().st_size <= MAX_ARCHIVE, "archive_limit")
        with archive.open("rb") as src:
            shutil.copyfileobj(src, output, 65536)


def verify():
    # All unit arguments are constants; neither SSH input nor manifest can set a property.
    proof = run(["/usr/bin/systemd-run", "--quiet", "--pipe", "--wait", "--collect",
         "--unit=skm-site-restore-check", "--service-type=exec",
         "--property=User=skm_site_restore", "--property=Group=skm_site_restore",
         "--property=RuntimeDirectory=skm-site-restore", "--property=RuntimeDirectoryMode=0700",
         "--property=UMask=0077", "--property=PrivateTmp=yes", "--property=PrivateNetwork=yes",
         "--property=ProtectSystem=strict", "--property=ProtectHome=yes",
         "--property=NoNewPrivileges=yes", "--property=CapabilityBoundingSet=",
         "--property=RestrictAddressFamilies=AF_UNIX", "--property=ProtectKernelTunables=yes",
         "--property=ProtectControlGroups=yes", "--property=RestrictSUIDSGID=yes",
         "--property=InaccessiblePaths=/var/run/postgresql /var/lib/postgresql /etc/skm-site-mail /etc/skm-site-backup",
         "--property=ReadWritePaths=/run/skm-site-restore", "--property=MemoryMax=1G",
         "--property=CPUQuota=100%", "--property=TasksMax=64", "--property=LimitFSIZE=256M",
         "--property=MemorySwapMax=0",
         "--property=RuntimeMaxSec=12min", "--property=TimeoutStopSec=20s",
         "--property=KillMode=control-group", "--property=StandardError=null",
         "/usr/bin/python3", "-I", "/opt/skm-site-backup/restore.py"],
        stdin=sys.stdin.buffer, timeout=780)
    require(proof == b'{"status":"passed","counts_verified":true,"amcheck":"passed"}\n', "restore_failed")
    sys.stdout.buffer.write(proof)


def export_unit():
    # Root staging and Python/PG buffers must not spill to host swap either.
    run(["/usr/bin/systemd-run", "--quiet", "--pipe", "--wait", "--collect",
         "--unit=skm-site-export-job", "--service-type=exec",
         "--property=User=root", "--property=RuntimeDirectory=skm-site-export",
         "--property=RuntimeDirectoryMode=0700", "--property=UMask=0077",
         "--property=MemoryMax=1G", "--property=MemorySwapMax=0",
         "--property=CPUQuota=100%", "--property=TasksMax=32",
         "--property=RuntimeMaxSec=10min", "--property=TimeoutStopSec=20s",
         "--property=KillMode=control-group", "--property=LimitFSIZE=256M",
         "--property=StandardError=null", "/usr/bin/python3", "-I",
         "/opt/skm-site-backup/source.py", "_export"], stdout=sys.stdout.buffer, timeout=660)


def interrupted(*_):
    raise Failure("interrupted")


def main():
    require(os.geteuid() == 0 and len(sys.argv) == 2 and sys.argv[1] in {"export", "verify", "_export"})
    os.umask(0o077)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGALRM, interrupted)
    signal.alarm(900)
    resource.setrlimit(resource.RLIMIT_FSIZE, (256 * 1024 * 1024, 256 * 1024 * 1024))
    if sys.argv[1] == "_export":
        # Internal root service entry, never present in SSH dispatcher or sudoers.
        export(sys.stdout.buffer)
        return
    with open("/run/skm-site-export.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if sys.argv[1] == "export":
            export_unit()
        else:
            verify()


if __name__ == "__main__":
    sys.exit(safe_main(main))
