#!/usr/bin/env python3
"""Deliver contact requests from the site's local PostgreSQL database."""

import argparse
from email.errors import HeaderParseError
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import formatdate
import json
import os
from pathlib import Path
import smtplib
import ssl
import subprocess
import sys

CLAIM = """
WITH next_request AS (
    SELECT id
    FROM contact_requests
    WHERE mail_sent_at IS NULL AND mail_next_attempt_at <= CURRENT_TIMESTAMP
    ORDER BY mail_next_attempt_at, id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
), claimed AS (
    UPDATE contact_requests AS r
    SET mail_next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
    FROM next_request AS n
    WHERE r.id = n.id
    RETURNING r.id, r.name, r.phone, r.email, r.comment
)
SELECT row_to_json(claimed) FROM claimed;
"""


def query(sql, variables=()):
    argv = ["psql", "-X", "--no-password", "--quiet", "--no-align", "--tuples-only",
            "--set", "ON_ERROR_STOP=1"]
    for key, value in variables:
        argv.extend(("--set", f"{key}={value}"))
    result = subprocess.run(argv, input=sql, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, encoding="utf-8",
                            check=True, timeout=10)
    return result.stdout.strip()


def settings():
    credential_dir = Path(os.environ["CREDENTIALS_DIRECTORY"])
    password = (credential_dir / "smtp-password").read_text(encoding="utf-8").strip()
    if not password:
        raise ValueError("empty SMTP credential")
    sender = Address(addr_spec=os.environ["SKM_CONTACT_SMTP_USER"])
    recipient = Address(addr_spec=os.environ["SKM_CONTACT_MAIL_TO"])
    return password, sender, recipient


def connect(sender, password):
    client = smtplib.SMTP_SSL(
        host=os.environ.get("SKM_CONTACT_SMTP_HOST", "smtp.yandex.ru"),
        port=int(os.environ.get("SKM_CONTACT_SMTP_PORT", "465")),
        context=ssl.create_default_context(), timeout=12,
    )
    try:
        client.login(sender.addr_spec, password)
    except (OSError, smtplib.SMTPException):
        client.close()
        raise
    return client


def message(contact, sender, recipient):
    request_id = int(contact["id"])
    letter = EmailMessage()
    letter["From"] = sender
    letter["To"] = recipient
    letter["Subject"] = f"СКМ — новая заявка с сайта №{request_id}"
    letter["Message-ID"] = f"<skm-contact-{request_id}@service-skm.ru>"
    letter["Date"] = formatdate(usegmt=True)
    if contact["email"]:
        try:
            letter["Reply-To"] = Address(addr_spec=contact["email"])
        except (ValueError, HeaderParseError):
            pass
    letter.set_content(
        f"ФИО: {contact['name'] or 'Не указано'}\n"
        f"Телефон: {contact['phone']}\n"
        f"Электронная почта: {contact['email'] or 'Не указана'}\n\n"
        f"Сообщение:\n{contact['comment'] or 'Без сообщения'}\n"
    )
    return letter


OBSERVABILITY_SQL = """
SELECT COUNT(*) = 3 FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'contact_requests'
  AND column_name IN ('mail_attempts', 'mail_status', 'mail_last_error')
  AND has_column_privilege(current_user, 'public.contact_requests', column_name, 'SELECT')
  AND has_column_privilege(current_user, 'public.contact_requests', column_name, 'UPDATE');
"""


def error_code(error):
    # Never persist SMTP replies: they can contain addresses, message fragments or secrets.
    if isinstance(error, smtplib.SMTPAuthenticationError):
        return "smtp_auth"
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return "smtp_recipient"
    if isinstance(error, smtplib.SMTPResponseException):
        return "smtp_rejected"
    if isinstance(error, (smtplib.SMTPException, OSError)):
        return "smtp_connection"
    return "message_configuration"


class MailDatabaseUnavailable(Exception):
    """Bounded database failure; safe category only, never a psql/SMTP payload."""


class MailPersistenceUnresolved(MailDatabaseUnavailable):
    """Some delivery-state writes remain unresolved at the bounded batch end."""


def deliver():
    client = None
    failed_phases = 0
    unresolved_writes: dict[
        tuple[int | None, str], tuple[str, tuple[tuple[str, int | str], ...]]
    ] = {}
    persistence_phases = {"db_ack_unconfirmed", "db_retry_status_unavailable", "db_uncertainty_status_unavailable"}

    def database(sql, variables=(), category="db_unavailable", request_id=None, attempts=2):
        nonlocal failed_phases
        # One short recovery retry per phase. No unbounded sleeps or batch restart.
        for _ in range(attempts):
            try:
                result = query(sql, variables)
                failed_phases = 0
                if category in persistence_phases:
                    unresolved_writes.pop((request_id, category), None)
                    if category == "db_ack_unconfirmed":
                        # A confirmed final acknowledgement supersedes earlier
                        # state failures for this message, never for another one.
                        for key in list(unresolved_writes):
                            if key[0] == request_id:
                                del unresolved_writes[key]
                return True, result
            except (OSError, subprocess.SubprocessError):
                pass
        failed_phases += 1
        if category in persistence_phases:
            unresolved_writes[(request_id, category)] = (sql, variables)
        prefix = f"Contact {request_id}" if request_id is not None else "Contact queue"
        print(f"{prefix} deferred ({category}).", file=sys.stderr)
        if failed_phases >= 3:
            if category in persistence_phases:
                raise MailPersistenceUnresolved("db_persistence_unresolved")
            raise MailDatabaseUnavailable("db_unavailable_bounded_exit")
        return False, ""

    available, mode = database(OBSERVABILITY_SQL, category="db_schema_unavailable")
    if not available:
        raise MailDatabaseUnavailable("db_schema_unavailable")
    observed = mode == "t"
    claim = CLAIM.replace(
        "SET mail_next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'",
        "SET mail_next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', "
        "mail_attempts = mail_attempts + 1, mail_status = 'sending'",
    ) if observed else CLAIM
    try:
        for _ in range(8):
            available, contact = database(claim, category="db_claim_unavailable")
            if not available:
                continue
            if not contact:
                break
            row = json.loads(contact)
            request_id = int(row["id"])
            try:
                if client is None:
                    password, sender, recipient = settings()
                    client = connect(sender, password)
                client.send_message(message(row, sender, recipient))
            except (smtplib.SMTPException, OSError, ValueError, KeyError) as error:
                code = error_code(error)
                if observed:
                    database("""
UPDATE contact_requests
SET mail_status = 'retry', mail_last_error = :'error_code'
WHERE id = :'request_id' AND mail_sent_at IS NULL;
""", (("request_id", request_id), ("error_code", code)), "db_retry_status_unavailable", request_id)
                print(f"Contact {request_id} deferred ({code}).", file=sys.stderr)
                if client is not None:
                    client.close()
                client = None
                continue
            extra = ", mail_status = 'sent', mail_last_error = NULL" if observed else ""
            acknowledged, _ = database("""
UPDATE contact_requests
SET mail_sent_at = CURRENT_TIMESTAMP, mail_next_attempt_at = NULL""" + extra + """
WHERE id = :'request_id' AND mail_sent_at IS NULL;
""", (("request_id", request_id),), "db_ack_unconfirmed", request_id)
            if not acknowledged and observed:
                # SMTP accepted this message. Keep its existing five-minute lease;
                # a future resend is possible, never label this as an SMTP rejection.
                database("""
UPDATE contact_requests
SET mail_status = 'retry', mail_last_error = 'smtp_accepted_unconfirmed'
WHERE id = :'request_id' AND mail_sent_at IS NULL;
""", (("request_id", request_id),), "db_uncertainty_status_unavailable", request_id)
        # One final recovery write per affected message (at most eight). Only
        # the same message/phase, or its final ack, can resolve prior failures.
        for recovery_request_id in dict.fromkeys(key[0] for key in unresolved_writes):
            for category in ("db_ack_unconfirmed", "db_retry_status_unavailable", "db_uncertainty_status_unavailable"):
                pending = unresolved_writes.get((recovery_request_id, category))
                if pending is not None:
                    database(*pending, category, recovery_request_id, attempts=1)
                    break
        # Claims (including empty reads) do not demonstrate write-path recovery.
        if unresolved_writes:
            raise MailPersistenceUnresolved("db_persistence_unresolved")
    finally:
        if client is not None:
            client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Verify SMTP credentials without sending mail.")
    args = parser.parse_args()
    try:
        if args.verify:
            password, sender, _ = settings()
            connect(sender, password).close()
            print("SMTP login verified.")
        else:
            deliver()
    except MailPersistenceUnresolved:
        print("Contact queue completed with unresolved delivery state (db_persistence_unresolved).", file=sys.stderr)
        return 1
    except MailDatabaseUnavailable:
        print("Contact queue stopped (db_unavailable_bounded_exit).", file=sys.stderr)
        return 1
    except (OSError, KeyError, ValueError, subprocess.SubprocessError, smtplib.SMTPException) as error:
        print(f"Contact mail delivery failed ({type(error).__name__}).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
