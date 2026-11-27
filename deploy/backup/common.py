"""Small shared protocol; installed root-owned beside the three entry points."""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import struct
import subprocess
import tempfile

DATABASE = "skm_site"
PG = "/usr/lib/postgresql/18/bin/"
MAX_DUMP = 128 * 1024 * 1024
MAX_ARCHIVE = 192 * 1024 * 1024
MAX_MANIFEST = 256 * 1024
MAX_FILE = 4 * 1024 * 1024
ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8",
       "HOME": "/nonexistent", "PGCONNECT_TIMEOUT": "5",
       "PGOPTIONS": "-c lock_timeout=5000 -c statement_timeout=180000"}
# Exact installation contract. Never walk /etc, a home directory or an SSH directory.
REQUIRED_FILES = {
    "recovery/smtp-password": "/etc/skm-site-mail/smtp-password",
    "recovery/skm-site-mail.service": "/etc/systemd/system/skm-site-mail.service",
    "recovery/skm-site-mail.timer": "/etc/systemd/system/skm-site-mail.timer",
    "recovery/skm-site-retention.service": "/etc/systemd/system/skm-site-retention.service",
    "recovery/skm-site-retention.timer": "/etc/systemd/system/skm-site-retention.timer",
    "recovery/contact-mailer.py": "/opt/skm-site-mail/contact-mailer.py",
    "recovery/database-admin.py": "/opt/skm-site-maintenance/database-admin.py",
    "recovery/001-audit-controls.sql": "/opt/skm-site-maintenance/migrations/001-audit-controls.sql",
    "recovery/002-consent-utc.sql": "/opt/skm-site-maintenance/migrations/002-consent-utc.sql",
    "recovery/skm-site-mail-grants.sql": "/etc/skm-site-backup/recovery/skm-site-mail-grants.sql",
    "recovery/skm-site-maintenance-grants.sql": "/etc/skm-site-backup/recovery/skm-site-maintenance-grants.sql",
}
OPTIONAL_FILES = {
    "recovery/timeweb-recovery.enc": "/etc/skm-site-backup/timeweb-recovery.enc",
}
ALLOWED = {"manifest.json", "database.dump", *REQUIRED_FILES, *OPTIONAL_FILES}


class Failure(Exception):
    """Only fixed categories cross the log boundary."""


def require(condition, category="invalid_input"):
    if not condition:
        raise Failure(category)


def run(argv, *, input=None, stdin=None, stdout=None, timeout=240, env=None, limit=MAX_MANIFEST):
    """No shell, inherited credentials, raw subprocess diagnostics or surviving child groups."""
    with tempfile.TemporaryFile() as output:
        proc = subprocess.Popen(argv, stdin=subprocess.PIPE if input is not None else
                                (stdin if stdin is not None else subprocess.DEVNULL),
                                stdout=stdout if stdout is not None else output,
                                stderr=subprocess.DEVNULL, env=env or ENV, start_new_session=True)
        try:
            proc.communicate(input=input, timeout=timeout)
            require(proc.returncode == 0, "command_failed")
            if stdout is None:
                require(output.tell() <= limit, "output_limit")
                output.seek(0)
                return output.read(limit + 1)
            return b""
        except BaseException:
            if proc.poll() is None:
                if os.name == "posix":
                    os.killpg(proc.pid, signal.SIGKILL)
                else:
                    proc.kill()
            proc.wait(timeout=10)
            raise


def protected(path, *, owner=0, directory=False):
    """Reject symlinks in every path component and mutable ancestors."""
    path = Path(path)
    require(path.is_absolute(), "unsafe_path")
    for item in [*reversed(path.parents), path]:
        info = item.lstat()
        require(not stat.S_ISLNK(info.st_mode), "unsafe_path")
        if os.name == "posix":
            require(info.st_uid in {0, owner} and not info.st_mode & 0o022, "unsafe_path")
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), "unsafe_path")
    return path


def digest(path):
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            size += len(block)
            require(size <= MAX_DUMP, "file_limit")
            h.update(block)
    return {"size": size, "sha256": h.hexdigest()}


def json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def counts_sql(tables):
    require(0 < len(tables) <= 64 and len(set(tables)) == len(tables), "invalid_tables")
    require(all(isinstance(t, str) and re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", t) for t in tables),
            "invalid_tables")
    parts = [f"SELECT '{t}' AS name, count(*) AS n FROM public.\"{t}\"" for t in sorted(tables)]
    parts.append("SELECT '@sent', count(*) FROM public.contact_requests WHERE mail_sent_at IS NOT NULL")
    return "SELECT json_object_agg(name,n) FROM (" + " UNION ALL ".join(parts) + ") counts;"


TABLES_SQL = ("SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) "
              "FROM pg_tables WHERE schemaname='public';")


def validate_manifest(manifest):
    require(isinstance(manifest, dict) and manifest.get("format") == 1 and
            manifest.get("database") == DATABASE, "wrong_database")
    counts = manifest.get("counts")
    require(isinstance(counts, dict) and "@sent" in counts and
            all(type(n) is int and 0 <= n <= 10**12 for n in counts.values()), "invalid_counts")
    counts_sql([k for k in counts if k != "@sent"])
    require({"services", "users", "contact_requests"}.issubset(counts), "invalid_counts")
    files = manifest.get("files")
    require(isinstance(files, dict) and set(files) <= ALLOWED - {"manifest.json"} and
            {"database.dump", *REQUIRED_FILES}.issubset(files), "invalid_files")
    for name, meta in files.items():
        require(isinstance(meta, dict) and type(meta.get("size")) is int and
                0 < meta["size"] <= (MAX_DUMP if name == "database.dump" else MAX_FILE) and
                isinstance(meta.get("sha256"), str) and re.fullmatch("[0-9a-f]{64}", meta["sha256"]),
                "invalid_files")
    return manifest


def read_exact(stream, size):
    result = bytearray()
    while len(result) < size:
        data = stream.read(min(size - len(result), 65536))
        require(bool(data), "truncated_frame")
        result.extend(data)
    return bytes(result)


def write_frame(stream, manifest, dump):
    encoded = json_bytes(validate_manifest(manifest))
    require(len(encoded) <= MAX_MANIFEST, "manifest_limit")
    stream.write(b"SKMBK001" + struct.pack("!IQ", len(encoded), manifest["files"]["database.dump"]["size"]))
    stream.write(encoded)
    with open(dump, "rb") as src:
        for block in iter(lambda: src.read(65536), b""):
            stream.write(block)


def read_frame(stream, dump):
    require(read_exact(stream, 8) == b"SKMBK001", "invalid_frame")
    length, size = struct.unpack("!IQ", read_exact(stream, 12))
    require(0 < length <= MAX_MANIFEST and 0 < size <= MAX_DUMP, "frame_limit")
    manifest = validate_manifest(json.loads(read_exact(stream, length)))
    require(size == manifest["files"]["database.dump"]["size"], "invalid_frame")
    with open(dump, "xb") as out:
        remaining = size
        while remaining:
            block = read_exact(stream, min(remaining, 65536))
            out.write(block)
            remaining -= len(block)
    require(stream.read(1) == b"" and digest(dump) == manifest["files"]["database.dump"], "checksum_failed")
    return manifest


def safe_main(main):
    try:
        main()
        return 0
    except BaseException:
        # Never print exception text, SQL, command output, filenames or credentials.
        os.write(2, b"skm_backup_failed\n")
        return 1
