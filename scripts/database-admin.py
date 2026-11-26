#!/usr/bin/env python3
"""Offline database administration using Python standard library and psql only."""
import argparse
import hashlib
import json
import os
from datetime import datetime
import time
from pathlib import Path
import re
import subprocess
import sys


def query(sql):
    result = subprocess.run(["psql", "-X", "--no-password", "--quiet", "--no-align",
                             "--tuples-only", "--set", "ON_ERROR_STOP=1"],
                            input=sql, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            encoding="utf-8", check=True, timeout=180)
    return result.stdout.strip()


def expected_database_name(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", value):
        raise ValueError("explicit expected database required")
    return value


def target_guard(expected_database):
    name = expected_database_name(expected_database)
    return f"DO $$ BEGIN IF current_database() <> '{name}' THEN RAISE EXCEPTION 'Unexpected target database'; END IF; END $$;\n"


def verify_backup(backup, checksum, manifest, expected_database, restore_command=("pg_restore",)):
    expected_database_name(expected_database)
    for filename in (backup, manifest):
        path = Path(filename)
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or (os.name != "nt" and path.stat().st_mode & 0o022):
            raise ValueError("absolute regular protected backup/manifest required")
    if not re.fullmatch(r"[a-f0-9]{64}", checksum):
        raise ValueError("expected SHA256 required")
    proof = json.loads(Path(manifest).read_text(encoding="utf-8"))
    if not isinstance(proof, dict) or not isinstance(proof.get("restoreVerification"), dict):
        raise ValueError("invalid backup provenance")
    restore = proof["restoreVerification"]
    if (proof.get("formatVersion") != 1 or proof.get("kind") != "full-database"
            or proof.get("database") != expected_database or proof.get("checksum") != checksum
            or restore.get("status") != "passed" or restore.get("countsVerified") is not True):
        raise ValueError("backup provenance/restore proof mismatch")
    expected_database_name(restore.get("database"))
    if datetime.fromisoformat(restore.get("verifiedAt", "")).tzinfo is None:
        raise ValueError("dated restore verification required")
    with Path(backup).open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != checksum:
            raise ValueError("backup checksum mismatch")
        source.seek(0)
        result = subprocess.run([*restore_command, "--list"], stdin=source, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, encoding="utf-8", check=True, timeout=30)
    name = re.search(r"^;\s+dbname:\s*(\S+)\s*$", result.stdout, re.MULTILINE)
    if not name or name.group(1) != expected_database:
        raise ValueError("archive source database mismatch")


def migration_sql(directory, additive_only=False, source_utc_verified=False, expected_database=None):
    guard = target_guard(expected_database)
    files = sorted(path for path in Path(directory).iterdir() if re.fullmatch(r"\d{3}-[a-z-]+\.sql", path.name))
    if not files:
        raise ValueError("migration files missing")
    inventory = [(path.name, path.read_text(encoding="utf-8").replace("\r\n", "\n")) for path in files]
    checksums = [(version, hashlib.sha256(sql.encode()).hexdigest()) for version, sql in inventory]
    expected = ", ".join(f"('{version}', '{checksum}')" for version, checksum in checksums)
    sql = f"""BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
{guard}SELECT pg_advisory_xact_lock(57065006);
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations AS m
        LEFT JOIN (VALUES {expected}) AS e(version, checksum)
        ON m.version = e.version AND m.checksum = e.checksum WHERE e.version IS NULL) THEN
        RAISE EXCEPTION 'Migration checksum mismatch or unknown version';
    END IF;
END $$;
"""
    for (version, body), (_, checksum) in zip(inventory, checksums):
        if additive_only and not version.startswith("001"):
            continue
        sql += f"SELECT NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '{version}') AS pending\n\\gset\n\\if :pending\n"
        if version.startswith("002") and not source_utc_verified:
            sql += """DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'admin_privacy_consents' AND column_name = 'received_at'
        AND data_type = 'timestamp without time zone') THEN
        RAISE EXCEPTION 'Independent UTC provenance and explicit flag required';
    END IF;
END $$;
"""
        sql += body + f"\nINSERT INTO schema_migrations (version, checksum) VALUES ('{version}', '{checksum}');\n\\endif\n"
    return sql + "COMMIT;\n"


LEGACY = ("balance_topup_requests", "chat_events", "invoices", "orders", "payments",
          "service_invoice_requests", "topup_requests", "transactions")


def retire_sql(backup, checksum, manifest, expected_database, restore_command=("pg_restore",)):
    verify_backup(backup, checksum, manifest, expected_database, restore_command)
    guard = target_guard(expected_database)
    names = ", ".join(f"'{name}'" for name in LEGACY)
    return f"""BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
{guard}SELECT pg_advisory_xact_lock(57065007);
DO $$
DECLARE tbl TEXT; names TEXT[]; populated BOOLEAN;
BEGIN
    SELECT array_agg(tablename::TEXT ORDER BY tablename) INTO names FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ({names});
    IF names IS NOT NULL THEN
        FOREACH tbl IN ARRAY names LOOP
            EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', tbl);
        END LOOP;
        FOREACH tbl IN ARRAY names LOOP
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I LIMIT 1)', tbl) INTO populated;
            IF populated THEN RAISE EXCEPTION 'Nonempty legacy table retained'; END IF;
        END LOOP;
        EXECUTE 'DROP TABLE ' || (SELECT string_agg(format('public.%I', name), ', ') FROM unnest(names) AS name);
        INSERT INTO admin_security_events (event_type, outcome, target_id)
        VALUES ('maintenance.retire_empty', 'success', array_to_json(names)::TEXT);
    END IF;
END $$;
COMMIT;
"""


def retention_sql(apply=False, batch=1000, expected_database=None):
    guard = target_guard(expected_database)
    if not 1 <= batch <= 5000:
        raise ValueError("batch must be 1..5000")
    rules = (
        ("otp_codes", "id", "expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'"),
        ("admin_sessions", "token_hash", "expires_at <= CURRENT_TIMESTAMP"),
        ("admin_security_events", "id", "created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'"),
        ("admin_totp_state", "email", "(email LIKE 'contact:%' AND attempt_window < FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 60) - 1440) OR (email LIKE 'audit:%' AND attempt_window < FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 60) - 1440) OR (email LIKE 'panel:%' AND attempt_window < FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 300) - 288)"),
    )
    sql = "BEGIN;\nSET LOCAL lock_timeout = '10s';\nSET LOCAL statement_timeout = '60s';\n" + guard + "SELECT pg_advisory_xact_lock(57065007);\n"
    for table, key, predicate in rules:
        selected = f'SELECT "{key}" FROM "{table}" WHERE {predicate} ORDER BY "{key}" LIMIT {batch}'
        if apply:
            sql += f'WITH removed AS (DELETE FROM "{table}" WHERE "{key}" IN ({selected}) RETURNING 1) '
        else:
            sql += f'WITH removed AS ({selected}) '
        sql += f"SELECT json_build_object('table', '{table}', 'count', COUNT(*)) FROM removed;\n"
    selected = f"SELECT id FROM contact_requests WHERE diagnostic_at < CURRENT_TIMESTAMP - INTERVAL '30 days' ORDER BY id LIMIT {batch}"
    if apply:
        sql += f"WITH cleared AS (UPDATE contact_requests SET diagnostic_ip_hash = NULL, diagnostic_agent = NULL, diagnostic_at = NULL WHERE id IN ({selected}) RETURNING 1) "
    else:
        sql += f"WITH cleared AS ({selected}) "
    sql += "SELECT json_build_object('table', 'contact_diagnostics', 'count', COUNT(*)) FROM cleared;\n"
    if apply:
        sql += "INSERT INTO admin_security_events (event_type, outcome) VALUES ('maintenance.cleanup', 'success');\n"
    return sql + ("COMMIT;\n" if apply else "ROLLBACK;\n")


def run_retention(expected_database, apply=False, max_batches=4, time_budget=120):
    if not 1 <= max_batches <= 4 or not 0 < time_budget <= 120:
        raise ValueError("invalid bounded retention budget")
    started = time.monotonic()
    totals: dict[str, int] = {}
    batches = 0
    backlog = False
    while True:
        output = query(retention_sql(apply, expected_database=expected_database))
        rows = [json.loads(line) for line in output.splitlines() if line.startswith("{")]
        if len(rows) != 5:
            raise ValueError("retention count evidence incomplete")
        batches += 1
        for row in rows:
            totals[row["table"]] = totals.get(row["table"], 0) + row["count"]
        backlog = any(row["count"] >= 1000 for row in rows)
        if not apply or not backlog or batches >= max_batches or time.monotonic() - started >= time_budget:
            return {"applied": apply, "counts": totals, "batches": batches, "backlogPossible": backlog}


def inventory(expected_database):
    # SQL count only, no business or credential records are printed.
    return query("BEGIN;\n" + target_guard(expected_database) + r"""SELECT format('SELECT json_build_object(''table'', %L, ''rows'', COUNT(*)) FROM public.%I;', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
COMMIT;
""")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("migrate", "retention", "inventory", "retire-empty-legacy"))
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true")
    modes.add_argument("--dry-run", action="store_true")
    parser.add_argument("--emit-sql", action="store_true", help="Review SQL; never connects to a database")
    parser.add_argument("--additive-only", action="store_true")
    parser.add_argument("--source-utc-verified", action="store_true")
    parser.add_argument("--migrations", type=Path)
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--backup", default="")
    parser.add_argument("--backup-sha256", default="")
    parser.add_argument("--backup-manifest", default="")
    args = parser.parse_args(argv)
    expected_database_name(args.expected_database)
    if args.command == "inventory" and (args.apply or args.dry_run or args.emit_sql):
        parser.error("inventory is a separate read-only mode")
    if args.command != "retire-empty-legacy" and any((args.backup, args.backup_sha256, args.backup_manifest)):
        parser.error("backup options require retirement mode")
    if args.command == "retire-empty-legacy" and not all((args.backup, args.backup_sha256, args.backup_manifest)):
        parser.error("retirement requires backup, checksum and provenance manifest")
    if args.command != "migrate" and (args.migrations or args.additive_only or args.source_utc_verified):
        parser.error("migration options require migrate mode")
    return args


def main():
    args = parse_args()
    if args.command == "migrate":
        directory = args.migrations or Path(__file__).resolve().parent.parent / "migrations"
        sql = migration_sql(directory, args.additive_only, args.source_utc_verified, args.expected_database)
        if args.emit_sql or not args.apply:
            print(sql)
        else:
            query(sql)
            print("Migrations applied; target and checksums verified.")
    elif args.command == "retire-empty-legacy":
        sql = retire_sql(args.backup, args.backup_sha256, args.backup_manifest, args.expected_database)
        if args.emit_sql or not args.apply:
            print(sql)
        else:
            query(sql)
            print("Empty allowlisted legacy tables retired; active tables preserved.")
    elif args.command == "retention":
        if args.emit_sql:
            print(retention_sql(args.apply, expected_database=args.expected_database))
        else:
            result = run_retention(args.expected_database, args.apply)
            print(json.dumps(result))
            if result["backlogPossible"]:
                print("Retention backlog remains after bounded drain; inspect timer capacity.", file=sys.stderr)
    else:
        print(inventory(args.expected_database))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError):
        print("Database administration failed; no secrets or business records logged.", file=sys.stderr)
        sys.exit(1)
