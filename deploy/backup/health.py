"""Fixed-category local health alerts; credential only available to this unit."""

import argparse
from email.message import EmailMessage
import os
from pathlib import Path
import re
import shutil
import smtplib
import ssl
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backup
from common import ENV, protected, require, run, safe_main
from ops import atomic_json, exclusive, read_json

ROOT = Path("/var/lib/skm-site-backup-health")
CONFIG = Path("/etc/skm-site-backup/health.json")
CREDENTIALS = Path("/run/credentials/skm-site-backup-health.service")
RECIPIENT = "i@ooo-skmoscow.ru"
UNITS = (
    "skm-site-backup.service",
    "skm-site-backup.timer",
    "skm-site-backup-maintenance.service",
    "skm-site-backup-maintenance.timer",
)
DAY = 86400
CATEGORIES = {
    "status_missing",
    "status_invalid",
    "backup_failed",
    "backup_running",
    "backup_stale",
    "restore_stale",
    "disk_free",
    "maintenance_missing",
    "maintenance_failed",
    "maintenance_invalid",
    "maintenance_stale",
} | {"unit_" + str(index) for index in range(len(UNITS))}


def timestamp(value, now):
    return type(value) is int and 0 < value <= now + 60


def assess(state, now, disk):
    findings = {}
    if state is None:
        findings["status_missing"] = "critical"
    elif not (
        state.get("format") == 1
        and state.get("repository_id") == repository_id()
        and all(
            timestamp(state.get(k), now)
            for k in ("last_success", "last_restore", "last_full_check", "last_run")
        )
        and isinstance(state.get("snapshot"), str)
        and re.fullmatch(r"[0-9a-f]{64}", state["snapshot"])
        and state.get("outcome") in {"success", "skipped", "running", "failed"}
    ):
        findings["status_invalid"] = "critical"
    else:
        if state["outcome"] == "failed":
            findings["backup_failed"] = "critical"
        if state["outcome"] == "running" and now - state["last_run"] >= 45 * 60:
            findings["backup_running"] = "critical"
        age = now - state["last_success"]
        if age >= 8 * 3600:
            findings["backup_stale"] = "critical" if age >= 12 * 3600 else "warning"
        if now - min(state["last_restore"], state["last_full_check"]) > 8 * DAY:
            findings["restore_stale"] = "critical"
    if disk.total <= 0 or disk.free < 0:
        findings["disk_free"] = "critical"
    elif disk.free <= 1024**3 or disk.free / disk.total <= 0.10:
        findings["disk_free"] = "critical"
    elif disk.free <= 2 * 1024**3 or disk.free / disk.total <= 0.20:
        findings["disk_free"] = "warning"
    return findings


def repository_id():
    # Only a public identifier is read; never load the backup credentials here.
    from maintenance import REPOSITORY_ID

    return REPOSITORY_ID


def units_health():
    findings = {}
    for index, unit in enumerate(UNITS):
        try:
            raw = run(
                [
                    "/usr/bin/systemctl",
                    "show",
                    unit,
                    "--no-pager",
                    "--property=LoadState,ActiveState,Result,ExecMainStatus,UnitFileState",
                ],
                env=ENV,
                timeout=10,
                limit=4096,
            )
            values = dict(
                line.split("=", 1) for line in raw.decode("ascii").splitlines()
            )
            require(
                values.get("LoadState") == "loaded"
                and values.get("ActiveState")
                in {"active", "inactive", "activating", "deactivating"}
                and (
                    not unit.endswith(".timer")
                    or (
                        values.get("ActiveState") == "active"
                        and values.get("UnitFileState") == "enabled"
                    )
                )
                and (
                    unit.endswith(".timer")
                    or (
                        values.get("Result") == "success"
                        and values.get("ExecMainStatus") == "0"
                    )
                ),
                "unit_failed",
            )
        except Exception:
            findings["unit_" + str(index)] = "critical"
    return findings


def collect(now):
    try:
        state = read_json(backup.STATUS) if backup.STATUS.exists() else None
    except Exception:
        state = {}
    findings = assess(state, now, shutil.disk_usage(backup.ROOT))
    findings.update(units_health())
    try:
        maintenance = read_json(backup.ROOT / "maintenance.json")
        require(
            maintenance.get("format") == 1
            and timestamp(maintenance.get("last_run"), now)
            and maintenance.get("outcome") in {"success", "running", "failed"},
            "invalid_maintenance",
        )
        if maintenance["outcome"] == "failed" or (
            maintenance["outcome"] == "running"
            and now - maintenance["last_run"] >= 50 * 60
        ):
            findings["maintenance_failed"] = "critical"
        if maintenance["outcome"] == "success":
            require(
                timestamp(maintenance.get("last_success"), now), "invalid_maintenance"
            )
            if now - maintenance["last_success"] > 8 * DAY:
                findings["maintenance_stale"] = "critical"
    except FileNotFoundError:
        findings["maintenance_missing"] = "warning"
    except Exception:
        findings["maintenance_invalid"] = "critical"
    return findings


def notice_plan(previous, findings, now):
    require(
        set(findings) <= CATEGORIES
        and set(findings.values()) <= {"warning", "critical"}
    )
    events, next_state = [], {}
    for category in sorted(set(previous) | set(findings)):
        old = previous.get(category)
        current = findings.get(category)
        if current is None:
            if old:
                events.append(category + ":recovered")
            continue
        if old is None or old["severity"] != current or now - old["sent"] >= DAY:
            events.append(category + ":" + current)
            next_state[category] = {"severity": current, "sent": now}
        else:
            next_state[category] = old
    return events, next_state


def load_notifications(now):
    path = ROOT / "notifications.json"
    if not path.exists():
        return {}
    state = read_json(path)
    require(
        state.get("format") == 1 and isinstance(state.get("active"), dict),
        "invalid_notifications",
    )
    require(set(state["active"]) <= CATEGORIES, "invalid_notifications")
    for record in state["active"].values():
        require(
            isinstance(record, dict)
            and record.get("severity") in {"warning", "critical"}
            and timestamp(record.get("sent"), now),
            "invalid_notifications",
        )
    return state["active"]


def send(events):
    config = read_json(CONFIG, owner=0)
    require(
        set(config) == {"smtp_user"}
        and isinstance(config["smtp_user"], str)
        and re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+", config["smtp_user"]),
        "invalid_mail_config",
    )
    require(
        Path(os.environ.get("CREDENTIALS_DIRECTORY", "")) == CREDENTIALS,
        "missing_credentials",
    )
    password_file = protected(CREDENTIALS / "smtp-password", owner=os.geteuid())
    require(0 < password_file.stat().st_size <= 4096, "invalid_credential")
    password = password_file.read_text().rstrip("\r\n")
    require(
        bool(password) and "\n" not in password and "\r" not in password,
        "invalid_credential",
    )
    message = EmailMessage()
    message["From"] = config["smtp_user"]
    message["To"] = RECIPIENT
    message["Subject"] = "SKM backup health"
    message.set_content("SKM backup health\n" + "\n".join(events) + "\n")
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    with smtplib.SMTP_SSL("smtp.yandex.ru", 465, context=context, timeout=20) as smtp:
        smtp.login(config["smtp_user"], password)
        require(not smtp.send_message(message), "mail_refused")


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true")
    modes.add_argument("--test-notification", action="store_true")
    args = parser.parse_args()
    require(os.geteuid() != 0, "unsafe_health_user")
    os.umask(0o077)
    protected(ROOT, owner=os.geteuid(), directory=True)
    if args.dry_run:
        collect(int(time.time()))
        return
    with exclusive(ROOT / "health.lock") as acquired:
        if not acquired:
            return
        now = int(time.time())
        if args.test_notification:
            send(["selftest:requested"])
            return
        previous = load_notifications(now)
        findings = collect(now)
        events, active = notice_plan(previous, findings, now)
        if events:
            send(events)
        # A rejected/failed send never advances the dedup or recovery state.
        atomic_json(ROOT / "notifications.json", {"format": 1, "active": active})


if __name__ == "__main__":
    sys.exit(safe_main(main))
