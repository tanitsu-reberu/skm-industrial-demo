# Audit closure rollout and operations (2026-11-26)

The web application runs on Timeweb; PostgreSQL and the mail worker run on the
company homeserver. No Node installation is needed on the homeserver. Commands
below are operator instructions, not evidence that deployment has occurred.
Keep all credentials in existing protected settings. Do not print environment
variables, contact bodies, password hashes, OTP secrets or SMTP responses.

## Before changing production

1. Record release, counts of users/services/contacts/sent mail, table ownership,
   column types, database/role/session timezone settings and migration ledger.
2. Create a private full `pg_dump -Fc` backup, hash it with SHA-256, retain an
   offhost copy and restore it to a distinct isolated PostgreSQL18 database.
   Verify counts, sequence values, application owner permissions and both
   authentication factors against synthetic fixtures on the restored copy.
3. Preserve `AUTH_SECRET`, `ADMIN_TOTP_SECRETS`, administrator identity and the
   secondary-password hash. Normal rollout does not rotate cookies or secrets.
4. Ship the exact reviewed SQL files and Python helper together. Files in
   `migrations/` are immutable after first production application. Checksums
   normalize CRLF to LF and hash UTF-8 content. Formatting changes also change
   checksums. Never edit the ledger to hide a mismatch; ship a new migration.

The existing idempotent schema bootstrap remains for old installations and local
SQLite tests. All audit upgrades use the versioned ledger. PostgreSQL startup
runs the bootstrap and upgrades in one transaction under advisory lock57065006.
The standalone CLI upgrades an existing installed schema. A fresh database is
initialized by the application first. SQLite remains a development/test fallback.

## Staged migration, grants, worker, web

On the homeserver place `database-admin.py` under
`/opt/skm-site-maintenance/`, and SQL files under
`/opt/skm-site-maintenance/migrations/`, owned by root and not writable by the
service users. The helper accepts an explicit `--migrations` directory.

```sh
# Operator only; psql uses peer authentication to the fixed local database.
sudo -u postgres env PGDATABASE=skm_site python3 \
  /opt/skm-site-maintenance/database-admin.py migrate --apply --additive-only --expected-database skm_site \
  --migrations /opt/skm-site-maintenance/migrations
```

Migration001 is additive. Old web and Python continue using their original
columns. No session cookie is revoked by the migration. Confirm new columns and
ledger before granting access to the worker.

```sh
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d skm_site \
  -f /private/release/deploy/skm-site-mail-grants.sql
```

Replace the mailer script, install the reviewed service unit, reload systemd,
and verify SMTP authentication under the exact unit restrictions without sending
a message. The new Python worker detects old schema or incomplete grants and
uses the legacy SQL until all three observability columns have SELECT/UPDATE
privileges. Settings, SMTP connection and send failures are isolated per message.
It claims at most8 messages per invocation, retries after5 minutes, increments
attempts on claim, and stores only an allowlisted error code. A successful send
means SMTP accepted the message, not that the mailbox delivered/read it. Database phases get one bounded recovery retry; three consecutive unavailable
phases stop the worker with a fixed actionable error category and exit1.
Acknowledgement failure after SMTP acceptance is logged as `db_ack_unconfirmed`,
with a best-effort `smtp_accepted_unconfirmed` state; the existing five-minute
lease remains. Retry/status writes have the same error boundary. Other messages
continue when DB access recovers. The deterministic Message-ID helps recognize duplicates after a crash between SMTP
acceptance and the DB update; exactly-once SMTP delivery is not claimed.

For migration002 independently establish that historical naive `received_at`
values represent UTC. A current timezone alone is insufficient proof. Preserve
the original default/schema/import code, historical DB/role timezone settings
and a timestamp correlation with a known timestamptz record. Parent evidence
for this installation: `closure-570e5006/timezone-proof.log` (Etc/UTC from config,
no DB/role overrides, CURRENT_TIMESTAMP default and consent/user timestamps
27ms apart when interpreted as UTC). The explicit flag records the operator's
decision; the runner otherwise refuses conversion of a naive source.

```sh
sudo -u postgres env PGDATABASE=skm_site python3 \
  /opt/skm-site-maintenance/database-admin.py migrate --apply --expected-database skm_site \
  --source-utc-verified --migrations /opt/skm-site-maintenance/migrations
```

Node24 alternative, using the existing protected `POSTGRES_URL` environment:

```sh
node scripts/db-migrations.mjs --preflight
node scripts/db-migrations.mjs --apply --additive-only
node scripts/db-migrations.mjs --apply --source-utc-verified
node scripts/db-migrations.mjs --postflight
```

Both runners share SQL, checksums, transaction/advisory lock and ledger. The
Python command without `--apply` emits reviewable SQL; `--emit-sql` never connects.
After applying, inspect `schema_migrations` and verify the consent column is
`timestamp with time zone`, original instants and business row counts unchanged.

Deploy the web candidate with `NEXT_PUBLIC_CONTACT_REQUESTS_ENABLED=1`, retaining
the existing secrets. Runtime startup requires the migration files in the
checkout. Legacy valid signed cookies are adopted by hash, with their original
expiry. Logout and individual revocation leave tombstones until expiry. Refresh
atomically rotates both cookies, preserving the secondary factor's original
expiry. Refresh cannot revive a revoked primary or secondary token. Each server
action rechecks administrator network, identity and the secondary factor.

## Retention and legacy inventory

Contacts keep their existing lawyer-authored business retention terms. Routine
cleanup does not delete contacts, administrator identities, financial/chat
records or the TOTP replay state of the configured administrator.

Create a dedicated unprivileged OS user/group `skm_site_maintenance`, without a
login shell or home credentials, then apply
`deploy/skm-site-maintenance-grants.sql` as operator. Peer authentication connects
only to `skm_site`. The role can read only cleanup selector columns, delete from
the four ephemeral tables, clear diagnostic columns and append cleanup facts.
It cannot read contact phone/comment, administrator passwords or session tokens.
Install the service/timer and helper; test dry-run and the exact syscall sandbox
before enabling the timer. Routine jobs run as this role, never root/postgres.

```sh
sudo -u skm_site_maintenance env PGDATABASE=skm_site python3 \
  /opt/skm-site-maintenance/database-admin.py retention --expected-database skm_site
# Explicit apply; timer runs this every5 minutes with at most4 batches of1000 rows per table, with a120s drain scheduling budget.
sudo -u skm_site_maintenance env PGDATABASE=skm_site python3 \
  /opt/skm-site-maintenance/database-admin.py retention --apply --expected-database skm_site
```

Retention: expired OTPs after24h; expired session registry entries (never
unexpired revocations); security events after90d; contact/panel/audit rate-limit
contexts after24h; request IP pseudonyms and coarse browser/OS after30d. Each transaction is bounded to1000 rows per table. The default automatic job
runs every5 minutes, drains up to4 batches while the120s scheduling budget
remains, and applies10s lock/60s statement timeouts before the first lock. This
provides up to48000 rows/hour/table, over26 times the admitted1800 contacts/hour.
At most one transaction can extend past the scheduling deadline; the Python
psql subprocess has a180s cap and systemd a4min job cap. Output includes counts,
batches and backlogPossible; a persistent backlog warning goes to the journal.
Monitor that flag and timer failures; no unbounded delete is used. Combined
anonymous factor log caps are at most22 events/minute (two factors,10 failures
and1 denial each), plus normal administrator actions and maintenance facts;
48000/hour leaves recovery margin. Unbounded authenticated administrative traffic
has no finite retention capacity guarantee, so backlog is explicitly observable. Rejected login logging is
atomically capped per factor/outcome/known actor:10 failures and1 denial per
minute. Keys never include attacker-supplied IP/text. Successful actions remain
recorded. The policy page adds technical facts separately from the lawyer text.

Inventory before retirement (operator only): Python `database-admin.py inventory --expected-database skm_site`
prints table names/counts, never records. The Node equivalent is
`node scripts/data-retention.mjs --inventory --expected-database=skm_site`. Node's explicit
`--archive=/private/absolute/path.dump` exports legacy tables as a private custom
dump plus SHA-256 manifest, with no deletion; alternatively use the verified
full operator backup on the homeserver. Nonempty business tables are preserved
pending an explicit owner retention/export decision.

Empty business tables can be retired only by a separate explicit operator
command. The allowlist is `balance_topup_requests`, `chat_events`, `invoices`,
`orders`, `payments`, `service_invoice_requests`, `topup_requests`, `transactions`.
`otp_codes` is retained because bootstrap/ephemeral cleanup still use it.
The command requires an absolute regular protected local custom backup, its expected
SHA-256 and a protected provenance manifest. It parses the archive with
`pg_restore --list`, checks its original dbname against the explicit expected
target, and validates the recorded restore/count verification. It then verifies
`current_database()` inside the transaction before any lock or mutation, locks all existing allowlisted tables, refuses if any is nonempty, and
drops them atomically without CASCADE. External FKs abort the transaction.
Active tables and tables outside the allowlist are never dropped.

```sh
# In the authorized root/operator Bash shell: backup/proof remain root-only.
set -e
umask 077
python3 /opt/skm-site-maintenance/database-admin.py retire-empty-legacy \
  --emit-sql --expected-database skm_site \
  --backup /var/backups/skm-site/closure-570e5006/full.dump \
  --backup-sha256 EXPECTED_FULL_64_HEX_DIGEST \
  --backup-manifest /var/backups/skm-site/closure-570e5006/verified-proof.json \
  > /var/backups/skm-site/closure-570e5006/retire-checked.sql
# The root shell opens the private SQL; psql runs as the peer-authenticated owner.
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d skm_site \
  < /var/backups/skm-site/closure-570e5006/retire-checked.sql
```

## Compression and live postflight

Timeweb ingress strips incoming trusted-context headers, derives client IP only
from configured peer + one verified forwarded IP, and signs its internal
context. Application code never trusts raw forwarded headers. It stores a daily
HMAC IP pseudonym and coarse browser/OS category, not raw IP/User-Agent.

Ingress requests identity encoding for all dynamic HTML/RSC/actions and adds
`private, no-store, no-transform`. Unexpected gzip/br/deflate dynamic upstream
bodies are streamed through a decoder; unsupported encodings fail closed.
Public assets retain their cache and compression behavior. CSP, secure cookies,
TLS and HTTP body limits remain in force. A local HTTP fixture verifies actual
gzip bytes with authenticated/reflected HTML; this is not proof about Timeweb's
outer edge. Check the real authenticated `/admin`, `/api/session`, login, RSC and
action responses with Accept-Encoding gzip/br; expect no Content-Encoding and
no-transform. Check JS/CSS still cache/compress. If the edge ignores no-transform,
configure/disable compression there before claiming BREACH mitigation complete.
Do not put real cookie values in saved commands/logs.

References supplied/verified by parent:
[Next.js compress](https://nextjs.org/docs/app/api-reference/config/next-config-js/compress),
[RFC9111 no-transform](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.6).

Postflight: existing owner's session remains authorized after reload; both
factors work in a separate synthetic test; revoke one test session and replay
its cookie (must fail); submit a synthetic contact once, verify admin queue,
attempts/status and mailbox receipt; change a synthetic status, check search/
pagination counts and security log; verify timer and error-free service status.

## Restoration

Prefer a forward repair migration. Never delete ledger rows or alter applied
SQL to make a failed release start. Additive001 can remain if a web rollout is
delayed. Old mailer SQL still works with the expanded schema/grants; mail_sent_at
takes precedence over mail_status during an old-worker/new-web overlap.

An old web release does not understand scrypt-v2 or server revocations. A rollback
must retain the new compatible password verifier and session registry checks;
blind rollback to the pre-audit authentication code would bypass revocations.
For disaster restoration stop web/worker/timer, restore the verified custom dump
into a distinct database, verify owners/privileges/counts/sequences/UTC values and
run the compatible application against it before switching the protected DB
connection. Keep the failed database intact for investigation. Reapply reviewed
role grants. A restore predating a revocation can revive old cookie state, so
rotate AUTH_SECRET during disaster recovery and explicitly require fresh login
with existing TOTP and secondary password. That exceptional recovery logout is
separate from normal rollout, which preserves owner access. Start the worker and
timer only after verification; SMTP already accepted before a crash may duplicate.

## Local verification commands

```sh
node tests/run-closure.cjs
node tests/sqlite-closure.cjs
node --test tests/ingress.test.mjs tests/retention-cli.test.mjs
python -m unittest discover -s tests -p "test_*.py" -v
npm run lint
# Set NEXT_PUBLIC_CONTACT_REQUESTS_ENABLED=1 in the process environment.
npm run build
```

The PostgreSQL runner uses only local Docker `skm-audit-pg-20261125`, port55432,
database `closure_570e5006`, with distinct non-superuser schema owner and narrow
test worker roles. It resets only this explicitly reserved test database. It
captures the lab credential internally and never prints it. The module loader
stubs Next request cookies/headers/cache, so these are focused integration tests;
parent owns real Next/browser/live ingress E2E and independent review.

Scrypt-v2 fixes N=131072,r=8,p=1,64byte key and16byte salt; accepts the exact old
N=16384 format and upgrades only after successful verification. It rejects
oversized/malformed encodings before work. At most2 asynchronous KDF operations
run per process; extra work fails closed. Local legacy verification + rehash
measured around280ms; deployment hardware needs its own measurement. Existing
password attempts remain bounded to10 per5 minutes per administrator.

Bandit subprocess/SQL-construction notices remain reviewable: psql uses fixed
argv, no shell, ON_ERROR_STOP, bounded subprocess timeouts, integer request IDs
and psql literal variables. Maintenance table/column/predicate names are fixed
allowlists; migration names are regex-restricted, checksums are hex, retirement
requires verified backup, and batch sizes are bounded integers. Tests execute
generated Node/Python SQL and verify nonempty refusal/narrow privileges. No
suppression is used. Native import of `@libsql/client/web` succeeds; its old
connection probe is not an actual missing dependency. Removed document/Vercel
helpers had no remaining maintained callers; Timeweb entrypoints are retained.


## Fix-round1 operational contract

Every maintenance invocation requires `--expected-database` (Node uses
`--expected-database=skm_site`). Cleanup and retirement compare the live database
inside their transaction before locks/mutations. Inventory/export also check the
name. Contradictory modes, including `--apply --dry-run` in either order and
inventory/archive/apply combinations, are rejected before connecting. Tests use
explicit `closure_570e5006`; production must explicitly name `skm_site`.

Retirement additionally requires a root/operator-owned proof file, not generated
by the cleanup role. Start from `deploy/backup-proof.example.json` and populate it
only after the protected full dump has been hashed and independently restored to
a distinct isolated database with counts checked. Required fields:
formatVersion1; kind full-database; database matching the intended source/target;
checksum matching the supplied SHA; restoreVerification status passed,
countsVerified true, restored database name and timezone-aware verifiedAt.
The archive's own pg_restore dbname must match the intended target too. A magic
prefix or a self-asserted checksum does not establish restore verification.
The manifest records operator provenance; automated validation cannot manufacture
that independent restore evidence. Existing parent restore evidence is suitable
for producing the protected production manifest. Symlinks and group/world-writable
backup/proof files are rejected (Windows uses normal file checks and its ACLs).

SQLite upgrades the earlier event/target column names transactionally and
preserves rows. Logout, panel close and individual revocation perform mandatory
server revocation even when the audit insert fails; fixed diagnostic categories
replace exception text. The expanded SQLite test executes actual TOTP/password,
security snapshots, contact mutations and audit-failing logout/replay branches.

Root-only backup/proof files need not be made readable by service roles. The
manual retirement example verifies them as the authorized root operator, emits
private checked SQL and only then invokes peer-authenticated psql as postgres.
The runtime SQL still checks the actual connected database before mutation.


## Fix-round2 mailer persistence outcome

The worker tracks unresolved delivery-state writes by request and phase, apart
from successful claims/reads. A new message's acknowledgement cannot clear an
older message's failure. After the bounded eight-message loop it makes at most
one final recovery write per affected message (acknowledgement first); this never
resends SMTP. Only the relevant successful write, or that message's confirmed
final acknowledgement superseding earlier status, clears its pending state.
Persisting an uncertainty status alone does not confirm a failed acknowledgement.
If any persistence remains unresolved, exit1 and fixed category
`db_persistence_unresolved` signal degraded delivery state to systemd. Persistent
observed-schema and legacy write-only failures therefore cannot appear as a
successful invocation merely because the queue became empty. Temporary failures
can still recover through the initial retry or bounded final reconciliation.
All existing psql subprocess and systemd time caps remain; the final recovery
adds at most8 write attempts. SMTP acceptance uncertainty remains distinct from
SMTP rejection, with unchanged lease and deterministic Message-ID.
