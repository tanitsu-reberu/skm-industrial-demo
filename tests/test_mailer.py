import contextlib
from email.headerregistry import Address
import importlib.util
import io
import json
from pathlib import Path
import smtplib
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("mailer", Path(__file__).resolve().parents[1] / "scripts/contact-mailer.py")
mailer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mailer)


class Client:
    def __init__(self, failures=0):
        self.failures = failures
        self.sent = []
        self.closed = False

    def send_message(self, message):
        if self.failures:
            self.failures -= 1
            raise smtplib.SMTPDataError(550, b"credential-and-message-marker")
        self.sent.append(message)

    def close(self):
        self.closed = True


class MailerTests(unittest.TestCase):
    def fixture(self, observed=True, failures=0, connect_failure=False):
        contacts = [dict(id=n, name="Fixture", phone="+79990000000", email="reply@example.test", comment="private-message") for n in (1, 2)]
        updates = []
        claims = []
        clients = [Client(failures), Client()]

        def query(sql, variables=()):
            if "information_schema.columns" in sql:
                return "t" if observed else "f"
            if "WITH next_request" in sql:
                claims.append(sql)
                return json.dumps(contacts.pop(0)) if contacts else ""
            updates.append((sql, dict(variables)))
            return ""

        def connect(*_):
            if connect_failure and len(contacts) == 1:
                raise smtplib.SMTPAuthenticationError(535, b"password-marker")
            return clients[min(1, len(claims) - 1)]

        with patch.object(mailer, "query", side_effect=query), patch.object(mailer, "connect", side_effect=connect), \
                patch.object(mailer, "settings", return_value=("password-marker", Address(addr_spec="i@ooo-skmoscow.ru"), Address(addr_spec="i@ooo-skmoscow.ru"))):
            log = io.StringIO()
            with contextlib.redirect_stderr(log):
                mailer.deliver()
        return updates, claims, clients, log.getvalue()

    def test_send_failure_updates_retry_and_continues(self):
        updates, claims, clients, log = self.fixture(failures=1)
        self.assertIn("mail_attempts = mail_attempts + 1", claims[0])
        self.assertIn("mail_status = 'retry'", updates[0][0])
        self.assertEqual(updates[0][1]["error_code"], "smtp_rejected")
        self.assertIn("mail_status = 'sent'", updates[1][0])
        self.assertEqual(len(clients[1].sent), 1)
        self.assertNotIn("credential-and-message-marker", log)
        self.assertNotIn("private-message", log)

    def test_connect_failure_is_per_message(self):
        updates, _, clients, log = self.fixture(connect_failure=True)
        self.assertEqual(updates[0][1]["error_code"], "smtp_auth")
        self.assertEqual(len(clients[1].sent), 1)
        self.assertNotIn("password-marker", log)

    def test_legacy_schema_and_grants_fallback(self):
        updates, claims, clients, _ = self.fixture(observed=False)
        self.assertNotIn("mail_attempts", claims[0])
        self.assertTrue(all("mail_status" not in sql for sql, _ in updates))
        self.assertEqual(len(clients[0].sent), 2)

    def test_error_allowlist_never_stores_exception_text(self):
        for error, expected in [(OSError("secret"), "smtp_connection"), (ValueError("secret"), "message_configuration"),
                                (smtplib.SMTPRecipientsRefused({"secret": "body"}), "smtp_recipient")]:
            self.assertEqual(mailer.error_code(error), expected)

    def database_fixture(self, phase, failure_count=2, permanent=False, smtp_failure=False):
        contacts = [dict(id=n, name="Fixture", phone="1234567", email=None, comment="private-message") for n in (1, 2)]
        client = Client(1 if smtp_failure else 0)
        calls = []
        remaining = {"ack": 2, "uncertainty": 2} if phase == "ack_and_uncertainty" else {phase: failure_count}

        def query(sql, variables=()):
            if "information_schema.columns" in sql:
                kind = "schema"
            elif "WITH next_request" in sql:
                kind = "claim"
            elif "mail_status = 'sent'" in sql:
                kind = "ack"
            elif "smtp_accepted_unconfirmed" in sql:
                kind = "uncertainty"
            else:
                kind = "retry"
            calls.append((kind, dict(variables)))
            if kind in remaining and (permanent or remaining[kind] > 0):
                remaining[kind] -= 1
                raise subprocess.CalledProcessError(1, ["psql"], stderr="credential-marker private-message")
            if kind == "schema":
                return "t"
            if kind == "claim":
                return json.dumps(contacts.pop(0)) if contacts else ""
            return ""

        log = io.StringIO()
        with patch.object(mailer, "query", side_effect=query), patch.object(mailer, "connect", return_value=client), \
                patch.object(mailer, "settings", return_value=("password-marker", Address(addr_spec="i@ooo-skmoscow.ru"), Address(addr_spec="i@ooo-skmoscow.ru"))), \
                contextlib.redirect_stderr(log):
            if permanent and phase in ("claim", "schema"):
                with self.assertRaises(mailer.MailDatabaseUnavailable):
                    mailer.deliver()
            else:
                mailer.deliver()
        self.assertNotIn("credential-marker", log.getvalue())
        self.assertNotIn("private-message", log.getvalue())
        return calls, client, log.getvalue()

    def test_ack_failure_records_uncertainty_and_continues_without_resend(self):
        calls, client, log = self.database_fixture("ack")
        self.assertEqual(len(client.sent), 2)
        self.assertEqual(len({str(message["Message-ID"]) for message in client.sent}), 2)
        self.assertTrue(any(kind == "uncertainty" for kind, _ in calls))
        self.assertIn("db_ack_unconfirmed", log)
        self.assertNotIn("smtp_rejected", log)

    def test_retry_status_write_failure_continues_after_database_recovers(self):
        calls, client, log = self.database_fixture("retry", smtp_failure=True)
        self.assertEqual(len(client.sent), 1)
        self.assertIn("db_retry_status_unavailable", log)
        self.assertTrue(any(kind == "ack" and values["request_id"] == 2 for kind, values in calls))

    def test_claim_failure_recovers_and_still_processes_next_messages(self):
        calls, client, log = self.database_fixture("claim")
        self.assertEqual(len(client.sent), 2)
        self.assertIn("db_claim_unavailable", log)
        self.assertLessEqual(sum(kind == "claim" for kind, _ in calls), 6)

    def test_permanent_database_failure_has_bounded_safe_exit(self):
        calls, client, log = self.database_fixture("claim", permanent=True)
        self.assertEqual(sum(kind == "claim" for kind, _ in calls), 6)
        self.assertEqual(len(client.sent), 0)
        self.assertIn("db_claim_unavailable", log)

    def test_ack_and_uncertainty_write_failures_still_allow_next_message(self):
        _, client, log = self.database_fixture("ack_and_uncertainty")
        self.assertEqual(len(client.sent), 2)
        self.assertIn("db_ack_unconfirmed", log)
        self.assertIn("db_uncertainty_status_unavailable", log)

    def test_main_returns_failure_on_bounded_database_exit(self):
        with patch.object(mailer, "query", side_effect=OSError("credential-marker")), \
                patch("sys.argv", ["contact-mailer.py"]), contextlib.redirect_stderr(io.StringIO()) as log:
            self.assertEqual(mailer.main(), 1)
        self.assertIn("db_unavailable_bounded_exit", log.getvalue())
        self.assertNotIn("credential-marker", log.getvalue())

    def test_schema_database_failure_never_silently_uses_legacy_sql(self):
        calls, client, _ = self.database_fixture("schema", permanent=True)
        self.assertEqual(len(calls), 2)
        self.assertEqual(len(client.sent), 0)

    def write_path_fixture(self, observed=True, failures=None, message_count=2):
        contacts = [dict(id=n, name="Fixture", phone="1234567", email=None, comment="private-message") for n in range(1, message_count + 1)]
        client = Client()
        calls = []
        remaining = dict(failures) if failures is not None else None

        def query(sql, variables=()):
            values = dict(variables)
            if "information_schema.columns" in sql:
                kind = "schema"
            elif "WITH next_request" in sql:
                kind = "claim"
            elif "SET mail_sent_at" in sql:
                kind = "ack"
            else:
                kind = "uncertainty"
            calls.append((kind, values.get("request_id")))
            if kind in ("ack", "uncertainty"):
                key = (values["request_id"], kind)
                if remaining is None or remaining.get(key, 0) > 0:
                    if remaining is not None:
                        remaining[key] -= 1
                    raise subprocess.CalledProcessError(1, ["psql"], stderr="private-credential-marker")
            if kind == "schema":
                return "t" if observed else "f"
            if kind == "claim":
                return json.dumps(contacts.pop(0)) if contacts else ""
            return ""

        log = io.StringIO()
        with patch.object(mailer, "query", side_effect=query), patch.object(mailer, "connect", return_value=client), \
                patch.object(mailer, "settings", return_value=("password-marker", Address(addr_spec="i@ooo-skmoscow.ru"), Address(addr_spec="i@ooo-skmoscow.ru"))), \
                patch("sys.argv", ["contact-mailer.py"]), contextlib.redirect_stderr(log):
            status = mailer.main()
        for secret in ("private-credential-marker", "password-marker", "private-message"):
            self.assertNotIn(secret, log.getvalue())
        self.assertNotIn("smtp_rejected", log.getvalue())
        return status, calls, client, log.getvalue()

    def test_observed_permanent_write_only_failure_returns_degraded_after_continuation(self):
        status, calls, client, log = self.write_path_fixture()
        self.assertEqual(status, 1)
        self.assertEqual(len(client.sent), 2)
        self.assertEqual(sum(kind in ("ack", "uncertainty") for kind, _ in calls), 10)
        self.assertEqual(sum(kind == "claim" for kind, _ in calls), 3)
        self.assertIn("db_persistence_unresolved", log)

    def test_legacy_permanent_ack_failure_returns_degraded_after_continuation(self):
        status, calls, client, log = self.write_path_fixture(observed=False)
        self.assertEqual(status, 1)
        self.assertEqual(len(client.sent), 2)
        self.assertEqual(sum(kind == "ack" for kind, _ in calls), 6)
        self.assertFalse(any(kind == "uncertainty" for kind, _ in calls))
        self.assertIn("db_persistence_unresolved", log)

    def test_other_message_ack_does_not_clear_first_message_write_failure(self):
        for observed in (True, False):
            with self.subTest(observed=observed):
                status, _, client, log = self.write_path_fixture(observed, {(1, "ack"): 3, (1, "uncertainty"): 2})
                self.assertEqual(status, 1)
                self.assertEqual(len(client.sent), 2)
                self.assertIn("db_persistence_unresolved", log)

        # Persisting uncertainty alone does not confirm the failed acknowledgement.
        status, _, _, log = self.write_path_fixture(True, {(1, "ack"): 3})
        self.assertEqual(status, 1)
        self.assertIn("db_persistence_unresolved", log)

    def test_only_relevant_ack_retry_or_final_recovery_clears_failure(self):
        for observed in (True, False):
            with self.subTest(observed=observed):
                status, _, client, _ = self.write_path_fixture(observed, {(1, "ack"): 1})
                self.assertEqual(status, 0)
                self.assertEqual(len(client.sent), 2)
        for observed in (True, False):
            with self.subTest(recovery_after_batch=observed):
                status, calls, client, _ = self.write_path_fixture(observed, {(1, "ack"): 2, (1, "uncertainty"): 2})
                self.assertEqual(status, 0)
                self.assertEqual(sum(kind == "ack" and request_id == 1 for kind, request_id in calls), 3)
        status, _, client, log = self.write_path_fixture(True, {(1, "ack"): 2})
        self.assertEqual(status, 0)
        self.assertEqual(len(client.sent), 2)
        self.assertIn("db_ack_unconfirmed", log)
        self.assertNotIn("db_persistence_unresolved", log)

    def test_permanent_write_failure_keeps_eight_message_batch_bound(self):
        status, calls, client, _ = self.write_path_fixture(message_count=12)
        self.assertEqual(status, 1)
        self.assertEqual(len(client.sent), 8)
        self.assertEqual(sum(kind == "claim" for kind, _ in calls), 8)
        self.assertEqual(len({str(message["Message-ID"]) for message in client.sent}), 8)

    def test_reply_to_header_injection_does_not_stop_message(self):
        contact = dict(id=1, name=None, phone="1234567", email="bad\r\nBcc: hidden@example.test", comment="fixture")
        message = mailer.message(contact, Address(addr_spec="i@ooo-skmoscow.ru"), Address(addr_spec="i@ooo-skmoscow.ru"))
        self.assertIsNone(message["Reply-To"])
        self.assertIsNone(message["Bcc"])


if __name__ == "__main__":
    unittest.main()
