"""Bounded weekly garbage collection; never forget logical snapshots here."""

import argparse
import json
import os
from pathlib import Path
import re
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backup
from common import ENV, protected, require, run, safe_main
from ops import atomic_json, exclusive, read_json

REPOSITORY_ID = "5ccf27fd732561079332ec5c501577c2c7ed661c066b67ec94ebfa10ff5d894c"
CREDENTIALS = Path("/run/credentials/skm-site-backup-maintenance.service")


def context():
    config = read_json(backup.CONFIG, owner=0)
    require(
        set(config) <= {"repository_id", "restic_version", "restic_binary"}
        and config.get("repository_id") == REPOSITORY_ID
        and config.get("restic_version") == "0.20.0"
        and config.get("restic_binary", backup.RESTIC)
        == "/opt/skm-site-backup/bin/restic",
        "invalid_maintenance_config",
    )
    protected(backup.RESTIC)
    backup.repository_guard(backup.REPO, REPOSITORY_ID)
    require(
        Path(os.environ.get("CREDENTIALS_DIRECTORY", "")) == CREDENTIALS,
        "missing_credentials",
    )
    password = protected(CREDENTIALS / "restic-password", owner=os.geteuid())
    return {
        **ENV,
        "RESTIC_PASSWORD_FILE": str(password),
        "GOMEMLIMIT": "96MiB",
        "GOGC": "50",
    }


def command(env, *args, dry_run=False, **kwargs):
    return run(
        [
            backup.RESTIC,
            "--repo",
            str(backup.REPO),
            "--no-cache",
            *(["--no-lock"] if dry_run else []),
            *args,
        ],
        env=env,
        **kwargs,
    )


def identity(env, dry_run):
    require(
        run([backup.RESTIC, "version"], env=env).startswith(b"restic 0.20.0 "),
        "wrong_restic_version",
    )
    require(
        json.loads(command(env, "cat", "config", dry_run=dry_run)).get("id")
        == REPOSITORY_ID,
        "wrong_repository_id",
    )


def ready(state, now):
    require(
        state.get("format") == 1
        and state.get("repository_id") == REPOSITORY_ID
        and state.get("outcome") in {"success", "skipped"},
        "unsafe_backup_state",
    )
    for key, age in (
        ("last_success", 8 * 3600),
        ("last_restore", 8 * 86400),
        ("last_full_check", 8 * 86400),
    ):
        value = state.get(key)
        require(
            type(value) is int and 0 < value <= now + 60 and now - value <= age,
            "stale_backup_proof",
        )
    require(
        isinstance(state.get("snapshot"), str)
        and re.fullmatch(r"[0-9a-f]{64}", state["snapshot"]),
        "invalid_snapshot",
    )


def snapshot_ids(env, dry_run):
    rows = json.loads(
        command(env, "snapshots", "--json", dry_run=dry_run, limit=2 * 1024 * 1024)
    )
    require(isinstance(rows, list) and bool(rows), "missing_snapshots")
    ids = [row.get("id") for row in rows]
    require(
        all(isinstance(i, str) and re.fullmatch(r"[0-9a-f]{64}", i) for i in ids)
        and len(set(ids)) == len(ids),
        "invalid_snapshots",
    )
    return set(ids)


def cycle(env, state, now, *, dry_run=False):
    ready(state, now)
    identity(env, dry_run)
    before = snapshot_ids(env, dry_run)
    require(state["snapshot"] in before, "missing_verified_snapshot")
    command(env, "check", "--read-data", dry_run=dry_run, timeout=900)
    identity(env, dry_run)
    command(
        env,
        "prune",
        "--max-repack-size",
        "128M",
        "--max-unused",
        "0",
        *(["--dry-run"] if dry_run else []),
        dry_run=dry_run,
        timeout=900,
    )
    identity(env, dry_run)
    command(env, "check", "--read-data", dry_run=dry_run, timeout=900)
    require(snapshot_ids(env, dry_run) == before, "snapshot_set_changed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    require(os.geteuid() != 0, "unsafe_maintenance_user")
    os.umask(0o077)
    env = context()
    # Dry-run opens an existing lock read-only and creates neither status nor locks.
    with exclusive(backup.ROOT / "backup.lock", existing=True) as acquired:
        if not acquired:
            return
        state = read_json(backup.STATUS)
        now = int(time.time())
        if args.dry_run:
            cycle(env, state, now, dry_run=True)
            return
        path = backup.ROOT / "maintenance.json"
        result = {"format": 1, "last_run": now, "outcome": "running"}
        atomic_json(path, result)
        try:
            cycle(env, state, now)
        except BaseException:
            result["outcome"] = "failed"
            atomic_json(path, result)
            raise
        result.update(outcome="success", last_success=int(time.time()))
        atomic_json(path, result)


if __name__ == "__main__":
    sys.exit(safe_main(main))
