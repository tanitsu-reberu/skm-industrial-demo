#!/usr/bin/env python3
"""Deliver contact requests from the site's local PostgreSQL database."""

import argparse
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
        letter["Reply-To"] = Address(addr_spec=contact["email"])
    letter.set_content(
        f"ФИО: {contact['name'] or 'Не указано'}\n"
        f"Телефон: {contact['phone']}\n"
        f"Электронная почта: {contact['email'] or 'Не указана'}\n\n"
        f"Сообщение:\n{contact['comment'] or 'Без сообщения'}\n"
    )
    return letter


def deliver():
    client = None
    try:
        for _ in range(8):
            contact = query(CLAIM)
            if not contact:
                return
            if client is None:
                password, sender, recipient = settings()
                client = connect(sender, password)
            row = json.loads(contact)
            client.send_message(message(row, sender, recipient))
            query("""
UPDATE contact_requests
SET mail_sent_at = CURRENT_TIMESTAMP, mail_next_attempt_at = NULL
WHERE id = :'request_id' AND mail_sent_at IS NULL;
""", (("request_id", int(row["id"])),))
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
    except (OSError, KeyError, ValueError, subprocess.SubprocessError, smtplib.SMTPException) as error:
        print(f"Contact mail delivery failed ({type(error).__name__}).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
