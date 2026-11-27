# SKM site offsite backup (operator-reviewed templates)

These files are not an installed backup. Provisioning, effective sshd checks,
first encrypted backup and actual PG18 restoration are the parent's rollout.
Never put keys, passwords, real environment values or recovered rows in Git or reports.
No application/auth/mail code or existing units are replaced by this change.

## Trust and scope

The source opens an outbound dedicated SSH connection on existing TCP22 to
45.138.157.30, binding **only 127.0.0.1:22224** on that host, forwarded to source
127.0.0.1:22. The offsite client pulls `export` through that port, then sends only
a framed manifest and custom dump back to `verify`. The source holds neither
the restic password nor a repository write/delete credential. The forwarding
key cannot run commands, open arbitrary local/Unix forwards or log into other
accounts. Source-root compromise could supply a false export/proof; this is
not protection against a dishonest source. The offsite host/service can delete
its own repository; keep a separate protected owner recovery copy.

Only database `skm_site` is dumped. The read-only repeatable-read psql transaction
exports one snapshot, obtains public-table counts plus sent-mail count from it,
and stays open until `pg_dump --snapshot` and `pg_restore --list` succeed. Dumps
include administrator hashes/identity, session state, contacts, services,
amcheck/private integrity schema, migrations and all other DB objects. Sequence
state is included by pg_dump; counts are a consistency check, not an exhaustive
application login test. Snapshot row counts must not be compared with a later
live database query, since writes can legitimately change them.

`common.REQUIRED_FILES` is the complete filesystem allowlist: the SMTP password,
mail and retention units (SMTP settings are in the mail unit), installed Python
helpers, migrations, and recovery copies of the two grant SQL files. Missing
required files fail the export. No SSH private keys, PostgreSQL global-role
passwords, SCADA databases/files, arbitrary home files or recursive directory
copies. Parent must stage the exact deployed grant SQL as root-only files under
`/etc/skm-site-backup/recovery/`. Migration filenames match this release.

Optional `/etc/skm-site-backup/timeweb-recovery.enc` is copied **opaquely**; the
manifest records its presence by its allowlisted name plus size/SHA256. Absence
is allowed. Never decrypt it in the source helper or restore sandbox. Without
an independently protected hosting-env recovery package, the database alone
cannot recover `AUTH_SECRET`, `ADMIN_TOTP_SECRETS`, selected admin email,
secondary-password configuration, Timeweb SSH bridge credentials, proxy/geo
settings and deployment configuration. Parent prepares this encrypted package
from authorized protected settings, preserves the deployed release and keeps
the matching decryption private key off both servers. Recovery must preserve
existing admin identity and secrets, not silently rotate them.

Migration003 is conditional recovery material:
`/opt/skm-site-maintenance/migrations/003-service-uploads.sql` is optionally
copied as `recovery/003-service-uploads.sql` when staged. If manifest counts
contains `service_uploads` (including an empty table), that exact file is
mandatory and size/SHA256 verified. Old snapshots without that table remain
valid without003. The existing source optional-file loop needs no change.
Parent updates compatible offsite readers first, stages the root-owned003
file before updating source common.py and before applying the DB migration.
This preserves old archives while preventing new upload-aware dumps from
omitting the SQL corresponding to their migration ledger. Physical upload
contents and their recovery path are a separate application's contract.

Both source staging and offsite selected restore files use private `/run`
directories (tmpfs). Offsite tar parsing never extracts paths or writes SMTP
credentials/the full plaintext tar to disk. No restic cache is enabled. Ensure
`/run` is tmpfs. Backup, tunnel, source export and isolated restore units use
`MemorySwapMax=0`; verify effective cgroup-v2 enforcement on both hosts without
changing global swap used by other applications. The current
small database fits the 256MiB offsite cgroup; bounded input caps are refusal
limits, not a guarantee that a 128MiB dump will fit alongside runtime memory.

## Root-owned installation contract (parent only)

1. Source: create distinct `skm_site_export` (locked password, `/bin/sh`, no home
   credentials), `skm_site_tunnel`, and `skm_site_restore` system accounts. No
   PostgreSQL login role/grant is needed for these accounts. Root's exporter
   invokes the existing peer-authenticated `postgres` OS account only for dump
   and snapshot reads. The restore account has no production database access.
   Offsite: create locked `skm_site_backup` system account, with a noninteractive
   shell, no sudo, no home credentials. Preserve every other project's files.
2. Install the reviewed Python files under `/opt/skm-site-backup/`, root:root,
   directory0755/files0644. `python3 -I` explicitly adds only this root-owned
   directory for shared imports. All ancestors must be root-owned/nonwritable
   by service users. Install only the appropriate files on each host: source
   needs common/source/restore/forced; offsite needs common/backup. Use LF files.
3. Source: install `source-tmpfiles.conf` as
   `/etc/tmpfiles.d/skm-site-export.conf`; create its root0700 runtime directory
   using `systemd-tmpfiles --create /etc/tmpfiles.d/skm-site-export.conf`.
   Install `source.sudoers` as `/etc/sudoers.d/skm-site-export`, root0440, after
   `visudo -cf` validation. No wildcard or additional sudo capability.
4. Generate TWO unrelated dedicated SSH key pairs privately. Forwarding private
   key is source root0600 `/etc/skm-site-backup/tunnel-key`; its public key goes
   in OFFSITE `/etc/ssh/authorized_keys/skm_site_backup`, root0644:

   ```text
   restrict,port-forwarding,permitlisten="127.0.0.1:22224",command="/bin/false" ssh-ed25519 REPLACE_PUBLIC_KEY
   ```

   Export/verify private key stays offsite root0600
   `/etc/skm-site-backup/source-key`; its public key goes in SOURCE
   `/etc/ssh/authorized_keys/skm_site_export`, root0644:

   ```text
   from="127.0.0.1",restrict,command="/usr/bin/python3 -I /opt/skm-site-backup/forced.py" ssh-ed25519 REPLACE_PUBLIC_KEY
   ```

   Keep the public-key directory `/etc/ssh/authorized_keys` root0755 and these
   public files root0644: sshd reads them under the account UID. Private keys
   and passwords remain separate root0600 credential inputs.
   Install the corresponding sshd Match templates; merge new AllowUsers tokens
   with existing rules. Source must retain `tanitsu` and
   `skm-site-db@127.0.0.1`, adding **only** `skm_site_export@127.0.0.1`.
   Multiple AllowUsers directives append; never replace an existing line with
   only the new account. Offsite may also have an AllowUsers list: append the
   forwarding account there without changing existing access. Validate
   `sshd -t` and `sshd -T -C user=...,host=...,addr=...` for old/new accounts,
   including refusal from a non-loopback source address; keep an operator
   session open during the parent's reload. Do not enable root/password login.
   `PermitUserEnvironment` is a global-only directive: never put it inside a
   `Match` block, including after `Match all`. These templates rely on the
   existing global/default `no`; verify `permituserenvironment no` in native
   `sshd -T -C` output on **both** hosts. If the effective global policy differs,
   parent must resolve it in the existing global section before enabling this
   setup; do not add a per-user override. The key restrictions and sanitized
   forced-command environment remain in place.
   Native `sshd -t` must pass against the complete candidate installed config
   on each host before any reload. Static template tests cannot replace this
   version-specific check. If it fails, remove only the new candidate drop-in,
   confirm `sshd -t` passes again, and leave the running daemon unreloaded.
5. Install the two client SSH configs on their respective hosts under
   `/etc/skm-site-backup/`, root0755 with root0755 ancestors so the service
   account can traverse it; keep client SSH configs root0644. Pin host keys out of band in root0644
   `source-known-hosts` (alias `skm-site-source`) and `offsite-known-hosts`
   (alias `skm-site-offsite`). Never trust ssh-keyscan output without independently
   matching fingerprints. Confirm port22224 unused before starting the tunnel.
6. Offsite: install a verified official standalone restic at
   `/opt/skm-site-backup/bin/restic`, root0755. Parent records release, SHA256
   and signature/checksum verification outside secret material. Ubuntu24.04
   restic0.16.4 lacks `--stdin-from-command` here and is rejected. Pin the ACTUAL
   version in root0644 `/etc/skm-site-backup/client.json` using the example.
   This file contains only repository ID, version and binary path, and must be
   readable by `skm_site_backup`; keep its parent directories root0755. It is
   never group/world-writable. Private credential source files remain root0600
   and are delivered separately by `LoadCredential`;
   `restic_binary` accepts that path (default) or `/usr/bin/restic`. There is
   **no fallback to `--stdin`**. Both version and actual help capability are
   checked each invocation, along with decrypted repository ID.
7. Offsite root: create `/etc/skm-site-backup/restic-password` privately (0600)
   and give the owner an independent protected offhost recovery copy. A
   DPAPI-protected owner recovery capsule can hold the full repo password and
   hosting recovery private key; verify owner recovery on the intended Windows
   identity and protect the capsule's ACL. A copied DPAPI blob alone may not
   survive loss of that Windows profile; maintain an owner-controlled recovery
   procedure outside this automation. Never put either key in a report.
8. Offsite: create `/var/lib/skm-site-backup` and its **dedicated** `repository`
   child, service-owned0700, no symlink anywhere in the path. Initialize only
   this empty new repository with the pinned restic as the backup user using
   the protected password supplied by an operator credential-bearing unit.
   Never initialize/adopt another project's repository or expose a password
   in argv/environment/logs. Read `restic cat config` through that same
   credential context and copy its exact64hex ID into root-owned client.json.
   The job never runs `init`, `unlock`, `prune`, `repair` or broad filesystem deletion.
9. Install source tunnel service and offsite backup service/timer, then run
   `systemd-analyze verify` on each host and inspect effective restrictions.
   `LoadCredential` gives the offsite service only its two keys; source tunnel
   gets only its forwarding key. Keep config/credentials/known-hosts outside
   StateDirectory; the service cannot overwrite them. A failed client-context
   preflight exits unsuccessfully without claiming a fresh success; monitor
   unit failure as well as status age. systemd cleans service runtime files.

## First run, schedule and failure semantics

Run the first backup manually via `systemctl start skm-site-backup.service`.
With no successful restore in status this MUST perform a full restic read check
and actual isolated PostgreSQL restore, even without a force flag. To force
another proof, parent may install a named runtime drop-in
`/run/systemd/system/skm-site-backup.service.d/90-force-once.conf`:

```ini
[Service]
ExecStart=
ExecStart=/usr/bin/python3 -I /opt/skm-site-backup/backup.py --force-restore
```

Reload, run the unit, remove **only that named drop-in**, reload. The equivalent
drop-in with `--dry-run` validates identity and runs retention simulation, with
no backup/restore/deletion/status changes. Combining these flags is rejected.
Do not run the Python client directly as root or copy service credentials into
an interactive environment.

Declare ready only after service success and `status.json` has `outcome=success`,
the pinned `repository_id`, exact snapshot ID and nonzero last_success,
last_restore/last_full_check. Independently inspect encrypted repo files and
loopback-only listening address; reject a snapshot if the source command fails
after emitting partial bytes. Test negative SSH exec/forwarding commands and
both original admin/mail paths before enabling the backup timer.

The timer wakes hourly with up to5min jitter. A new backup is due after6h since
the last verified success. Source offline/error -> failed unit, unchanged
last_success, safe `outcome=failed`, retry next hour. A running-state record left
after abrupt kill must be treated as incomplete; monitor the live unit and
compute stale age from last_success (a saved `stale` field is only a run-time
observation). flock allows one job. First/forced and at least weekly jobs run
`restic check --read-data` and real PG restore + count equality + amcheck
heapallindexed/checkunique/parent-check/rootdescend. Other jobs still fully
read/check every file in that selected snapshot. A failed check/restore never
advances success or invokes retention. There is no live parent-check.

After successful verification, retention is scoped to host `skm-site-source`
and tag `skm-site-v1`: keep last28, daily30, weekly8, monthly12. Repository
identity is checked again immediately before forget. The backup cycle itself
does not prune. The separate weekly maintenance and fifteen-minute health
monitor have their own reviewed units and installation procedure in [OPERATIONS.md](OPERATIONS.md).
Forgotten data blocks consume disk until that maintenance succeeds. With
11GiB available and the current small source this is practical initially, not
an indefinite capacity guarantee. Runtime/CPU/process/output/input limits
fail closed and preserve older snapshots. Root/host OOM or power loss can
interrupt status updates; status age and the unit's actual result both matter.

## Disaster recovery

Stop web writes/mail/retention only as a deliberate operator recovery action.
Unlock the owner recovery capsule privately. Select a verified snapshot using
its recorded ID and matching repo ID. Recover to an isolated machine first;
inspect the manifest and hashes before handling contents. The automated proof
restores with `--no-owner --no-acl` into an unprivileged throwaway PG18 cluster
with a private socket, no TCP/production socket/settings/credentials and no
capabilities. It intentionally does not prove original role ACLs or hosting
cutover. For real recovery recreate the reviewed narrow OS/DB roles/ownership,
apply preserved grants, restore DB and root-only mail files, inspect unit
settings and decrypt hosting env only in the protected owner/operator workflow.
Never replay archived arbitrary units/scripts automatically as root.

Verify admin identity/password hash/TOTP configuration, services, contact and
sent-mail counts, migration ledger, sequence state and mail queue before
switching. Sent SMTP messages are not exactly-once: preserve mail_sent_at and
the existing lease/state to avoid blind resends. Preserve auth signing/TOTP
secrets rather than resetting working sessions. Verify normal admin login and
one explicitly authorized synthetic mail after controlled cutover. The
automatic restore proof does not send mail or modify production.

## Local checks and references

`python3 -m unittest discover -s tests -p test_offsite_backup.py -v` (Linux).
Optional `SKM_TEST_RESTIC=/absolute/verified/restic` runs the real disposable-repo
producer-failure integration test; it never connects to either server.

Protocol choices follow [restic command input semantics](https://restic.readthedocs.io/en/stable/040_backup.html),
[PostgreSQL18 snapshot export](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_amcheck18](https://www.postgresql.org/docs/18/app-pgamcheck.html),
[OpenSSH restrictions](https://man.openbsd.org/sshd_config) and
[systemd execution/credentials](https://www.freedesktop.org/software/systemd/man/systemd.exec.html).
