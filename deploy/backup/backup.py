"""Offsite pull client. Invoke from the credential-bearing systemd oneshot only."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import sys
import tarfile
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (ALLOWED, ENV, MAX_ARCHIVE, MAX_DUMP, MAX_FILE, MAX_MANIFEST,
                    Failure, json_bytes, protected, require, run, safe_main,
                    validate_manifest, write_frame)

ROOT = Path("/var/lib/skm-site-backup")
REPO = ROOT / "repository"
CONFIG = Path("/etc/skm-site-backup/client.json")
STATUS = ROOT / "status.json"
RUNTIME = Path("/run/skm-site-backup")
RESTIC = "/opt/skm-site-backup/bin/restic"
TAG = "skm-site-v1"
INTERVAL = 6 * 3600
WEEK = 7 * 86400


def repository_guard(path, expected):
    require(Path(path) == REPO, "wrong_repository_path")
    protected(path, owner=os.geteuid(), directory=True)
    require(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected), "wrong_repository_id")


def client_context():
    global RESTIC
    config = json.loads(protected(CONFIG).read_bytes())
    require({"repository_id", "restic_version"} <= set(config) <=
            {"repository_id", "restic_version", "restic_binary"}, "invalid_config")
    RESTIC = config.get("restic_binary", "/opt/skm-site-backup/bin/restic")
    require(RESTIC in {"/usr/bin/restic", "/opt/skm-site-backup/bin/restic"}, "invalid_binary")
    protected(RESTIC)
    require(re.fullmatch(r"0\.[0-9]+\.[0-9]+", config["restic_version"]), "invalid_version")
    repository_guard(REPO, config["repository_id"])
    protected(ROOT, owner=os.geteuid(), directory=True)
    protected(RUNTIME, owner=os.geteuid(), directory=True)
    credential_dir = Path(os.environ.get("CREDENTIALS_DIRECTORY", ""))
    require(credential_dir == Path("/run/credentials/skm-site-backup.service"), "missing_credentials")
    password = protected(credential_dir / "restic-password", owner=os.geteuid())
    identity = protected(credential_dir / "source-key", owner=os.geteuid())
    protected("/etc/skm-site-backup/client-ssh.conf")
    protected("/etc/skm-site-backup/source-known-hosts")
    env = {**ENV, "RESTIC_PASSWORD_FILE": str(password), "GOMEMLIMIT": "96MiB", "GOGC": "50"}
    ssh = ["/usr/bin/ssh", "-F", "/etc/skm-site-backup/client-ssh.conf", "-i", str(identity),
           "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
           "-o", "ClearAllForwardings=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", "UserKnownHostsFile=/etc/skm-site-backup/source-known-hosts",
           "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ConnectTimeout=10",
           "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", "skm-site-source"]
    return config, env, ssh


def restic(env, *args, **kwargs):
    return run([RESTIC, "--repo", str(REPO), "--no-cache", *args], env=env, **kwargs)


def preflight(config, env):
    version = run([RESTIC, "version"], env=env).decode("ascii")
    require(version.startswith("restic " + config["restic_version"] + " "), "wrong_restic_version")
    help_text = run([RESTIC, "backup", "--help"], env=env)
    require(b"--stdin-from-command" in help_text, "unsupported_restic")
    repo = json.loads(restic(env, "cat", "config"))
    require(repo.get("id") == config["repository_id"], "wrong_repository_id")


class DeadlineReader:
    """Bound stream bytes and wall clock, including a producer which stops writing."""
    def __init__(self, pipe, timeout=300):
        self.pipe, self.remaining = pipe, MAX_ARCHIVE
        self.deadline = time.monotonic() + timeout

    def read(self, size):
        require(size >= 0, "unbounded_read")
        if size == 0:
            return b""
        with selectors.DefaultSelector() as sel:
            sel.register(self.pipe, selectors.EVENT_READ)
            require(bool(sel.select(max(0, self.deadline - time.monotonic()))), "archive_timeout")
        data = os.read(self.pipe.fileno(), min(size, 65536))
        self.remaining -= len(data)
        require(self.remaining >= 0, "archive_limit")
        return data


def validate_archive(stream, dump):
    """No tar extraction, only bounded regular allowlisted files; SMTP stays in memory blocks."""
    seen, checksums, manifest = set(), {}, None
    total = 0
    with tarfile.open(fileobj=stream, mode="r|", bufsize=512) as archive:
        for member in archive:
            require(len(seen) < len(ALLOWED) and member.name in ALLOWED and
                    member.name not in seen and member.type == tarfile.REGTYPE and
                    not member.pax_headers, "unsafe_archive")
            seen.add(member.name)
            maximum = MAX_DUMP if member.name == "database.dump" else (
                MAX_MANIFEST if member.name == "manifest.json" else MAX_FILE)
            require(0 < member.size <= maximum, "archive_limit")
            total += member.size
            require(total <= MAX_ARCHIVE - 10240, "archive_limit")
            content = archive.extractfile(member)
            require(content is not None, "unsafe_archive")
            h, count, encoded = hashlib.sha256(), 0, bytearray()
            with contextlib.ExitStack() as stack:
                target = stack.enter_context(open(dump, "xb")) if member.name == "database.dump" else None
                while True:
                    block = content.read(65536)
                    if not block:
                        break
                    count += len(block)
                    h.update(block)
                    if target:
                        target.write(block)
                    if member.name == "manifest.json":
                        encoded.extend(block)
                require(count == member.size, "truncated_archive")
            if member.name == "manifest.json":
                manifest = validate_manifest(json.loads(encoded))
            else:
                checksums[member.name] = {"size": count, "sha256": h.hexdigest()}
        # Reject appended entries/garbage after the first end-of-archive block.
        padding = archive.fileobj.read(10241)
        require(len(padding) <= 10240 and not padding.strip(b"\0"), "unsafe_archive_tail")
    require(manifest is not None and checksums == manifest["files"] and
            seen == {"manifest.json", *manifest["files"]}, "checksum_failed")
    with open(dump, "rb") as handle:
        require(handle.read(5) == b"PGDMP", "invalid_dump")
    return manifest


def check_snapshot(env, snapshot, ssh, restore):
    # A single selected snapshot, never 'latest' after the backup command has returned.
    require(re.fullmatch(r"[0-9a-f]{64}", snapshot), "invalid_snapshot")
    with tempfile.TemporaryDirectory(prefix="verify-", dir=RUNTIME) as tmp:
        dump = Path(tmp) / "database.dump"
        proc = subprocess.Popen([RESTIC, "--repo", str(REPO), "--no-cache", "dump", snapshot,
                                 "/export.tar"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                stdin=subprocess.DEVNULL, env=env, start_new_session=True, bufsize=0)
        try:
            reader = DeadlineReader(proc.stdout)
            manifest = validate_archive(reader, dump)
            # Drain and require a clean producer exit; an apparently complete tar is insufficient.
            require(reader.read(1) == b"", "unsafe_archive_tail")
            require(proc.wait(timeout=10) == 0, "archive_producer_failed")
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=10)
            proc.stdout.close()
        if restore:
            frame = Path(tmp) / "restore.frame"
            with frame.open("xb") as out:
                write_frame(out, manifest, dump)
            with frame.open("rb") as incoming:
                proof = run([*ssh, "verify"], stdin=incoming, env=env, timeout=800)
            require(proof == b'{"status":"passed","counts_verified":true,"amcheck":"passed"}\n', "restore_proof_failed")


def load_status():
    if not STATUS.exists():
        return {"format": 1, "last_success": 0, "last_restore": 0, "last_full_check": 0}
    state = json.loads(protected(STATUS, owner=os.geteuid()).read_bytes())
    require(state.get("format") == 1, "invalid_status")
    for key in ("last_success", "last_restore", "last_full_check"):
        require(type(state.get(key)) is int and 0 <= state[key] <= int(time.time()) + 60, "invalid_status")
    return state


def save_status(state):
    fd, name = tempfile.mkstemp(prefix=".status-", dir=ROOT)
    try:
        with os.fdopen(fd, "wb") as out:
            os.fchmod(out.fileno(), 0o600)
            out.write(json_bytes(state))
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, STATUS)
        directory = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def retention_args(dry_run=False):
    return ["forget", "--tag", TAG, "--host", "skm-site-source", "--group-by", "host,tags",
            "--keep-last", "28", "--keep-daily", "30", "--keep-weekly", "8", "--keep-monthly", "12",
            *(["--dry-run"] if dry_run else [])]


def cycle(config, env, ssh, state, *, now, force=False, dry_run=False):
    require(state.get("repository_id", config["repository_id"]) == config["repository_id"], "wrong_status_repo")
    preflight(config, env)
    if dry_run:
        # Even retention simulation needs valid repository identity. No backup, restore or status write.
        restic(env, *retention_args(True))
        return
    state["repository_id"] = config["repository_id"]
    if not force and now - state["last_success"] < INTERVAL:
        state.update(last_run=now, outcome="skipped", stale=False)
        save_status(state)
        return
    state.update(last_run=now, outcome="running", stale=now - state["last_success"] >= INTERVAL)
    save_status(state)
    try:
        # restic must observe the export process exit, including failure after partial stdout.
        raw = restic(env, "backup", "--json", "--host", "skm-site-source", "--tag", TAG,
                     "--stdin-filename", "export.tar", "--stdin-from-command", "--", *ssh, "export",
                     timeout=600, limit=2 * 1024 * 1024)
        summaries = [json.loads(line) for line in raw.splitlines() if line]
        ids = [entry.get("snapshot_id") for entry in summaries if entry.get("message_type") == "summary"]
        require(len(ids) == 1 and isinstance(ids[0], str), "missing_snapshot")
        weekly = now - state["last_full_check"] >= WEEK or now - state["last_restore"] >= WEEK
        full = force or weekly or not state["last_restore"]
        if full:
            restic(env, "check", "--read-data", timeout=900)
        check_snapshot(env, ids[0], ssh, full)
        # Guard again immediately before retention. There is deliberately no prune command.
        preflight(config, env)
        restic(env, *retention_args(), timeout=120)
        state.update(last_success=now, snapshot=ids[0], outcome="success", stale=False)
        if full:
            state.update(last_restore=now, last_full_check=now)
        save_status(state)
    except BaseException:
        state.update(outcome="failed", stale=now - state["last_success"] >= INTERVAL)
        save_status(state)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-restore", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    require(not (args.force_restore and args.dry_run), "contradictory_modes")
    require(os.geteuid() != 0, "unsafe_client_user")
    os.umask(0o077)
    config, env, ssh = client_context()
    with open(ROOT / "backup.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        state = load_status()
        try:
            cycle(config, env, ssh, state, now=int(time.time()), force=args.force_restore, dry_run=args.dry_run)
        except BaseException:
            if not args.dry_run:
                state.update(last_run=int(time.time()), outcome="failed",
                             stale=int(time.time()) - state["last_success"] >= INTERVAL)
                save_status(state)
            raise


if __name__ == "__main__":
    sys.exit(safe_main(main))
