# Backup operations addendum (parent/operator rollout)

This change is source and local-test evidence, not a production activation.
Read the existing README and the 2026-11-27 followup recovery runbook first.
Source/restore and the backup algorithm are unchanged. The separately authorized
common.py update adds only optional003 plus its conditional manifest requirement.
Preserve the
native SSH Match fixes, readable public configs, existing timers and credentials.
Do not reload SSH, initialize/adopt/unlock/repair a repository, rotate keys, or
change the application start command for this rollout.

## Installation contract

All files must be LF and match the implementation report's SHA256 manifest.
Install only reviewed files, using explicit filenames, not a wildcard copy of
the working directory. Existing `/opt/skm-site-backup` and `/etc/skm-site-backup`
and ancestors remain root-owned0755, source/config files root0644. The existing
backup account must be able to read public configuration. Do not chmod the
whole configuration tree0600 or put secrets in readable JSON.

On the offsite host, add root0644 `health.py`, `maintenance.py`, `ops.py` next
to the existing root-owned `backup.py`/`common.py`. Install the reviewed updated
`skm-site-backup.service` and new `skm-site-backup-{health,maintenance}.{service,timer}`
under `/etc/systemd/system`, root0644. The only backup-unit change is OnFailure.
Do not install `seal-timeweb.mjs` as a service.

Create `/etc/skm-site-backup/health.json`, root0644, with **only** `smtp_user`
set to the already verified Yandex account login. Parent securely provisions
the existing SMTP app password as root0600
`/etc/skm-site-backup/health-smtp-password`; never put it in argv, shell history,
environment, a report, or this checkout. Only the health unit loads this
credential. The maintenance unit loads only the existing restic-password;
it has no SMTP or source SSH key. The health unit has no restic/SSH credentials.
This is separation by unit, not separate UID isolation: the existing backup
account is trusted for these operations.

Keep `/var/lib/skm-site-backup` service-owned0700, including existing0600
`backup.lock`/`status.json`. Do not create a second repository or change its ID.
Health's separate `/var/lib/skm-site-backup-health` is created by systemd with
mode0700. Its `health.lock` and atomic `notifications.json` are0600. Maintenance
atomically writes `maintenance.json` beside backup status, without editing
`status.json`. Native `systemd-analyze verify` must pass on installed units;
verify effective cgroup-v2 `MemoryMax=268435456` and `MemorySwapMax=0` for
maintenance. It uses96MiB Go target/256MiB cgroup cap, one CPU, no network,
and a maximum128MiB repack (`--max-repack-size 128M`, native restic syntax).
The original offsite restic must remain official0.20.0 at
`/opt/skm-site-backup/bin/restic`, root0755, SHA256
`c109579d3a1a4d26094bef5400ac5645fceb1043414c05f51b8fb48272001c72`.
Do not use the older distro restic binary.

## Health and one legitimate notification self-test

Health runs every15min, also via OnFailure of backup and maintenance. It checks
the backup/maintenance services and both timers (loaded, timers active+enabled,
service result/exit code), status presence/schema/repo/outcome, last verified
success, full-read/restore proof age, and available space on the repository
filesystem. An active oneshot is allowed; a backup running45min or maintenance
running50min is incomplete. Missing maintenance status warns until its first run.

Backup age8h warns,12h is critical: the existing6h copy interval plus hourly
retry leaves a buffer. Free space20% **or**2GiB warns,10% **or**1GiB is critical.
Full-read/real-restore proof older than8days is critical. Missing/invalid backup
status, failed outcome or failed unit is critical. Maintenance failure,
invalid status or success older than8days is critical. Notifications contain
fixed category/severity tokens only, no rows, personal data, exception text,
paths, SMTP responses or credentials. SMTP is certificate/hostname verified
TLS1.2+ directly to `smtp.yandex.ru:465`; recipient is fixed
`i@ooo-skmoscow.ru`. Repeated unchanged incidents are suppressed24h; severity
changes and recovery notify immediately. Failed send leaves dedup unchanged;
an SMTP-accepted message followed by a state-write/power failure can repeat.

Before normal scheduling, parent may perform one authorized real notification
through **the existing credential-bearing health service**, not a differently
named transient unit or a bare Python shell command:

1. Stop only `skm-site-backup-health.timer` if already installed/enabled. Wait
   for `skm-site-backup-health.service` to become inactive; do not kill it.
2. Create only `/run/systemd/system/skm-site-backup-health.service.d/90-selftest.conf`
   root0644, containing:

   ```ini
   [Service]
   ExecStart=
   ExecStart=/usr/bin/python3 -I /opt/skm-site-backup/health.py --test-notification
   ```

3. Daemon-reload; inspect `systemctl cat`/`show` to confirm the normal hardening,
   exact LoadCredential and exact `/run/credentials/skm-site-backup-health.service`
   path still apply. Start the service once, require Result=success/exit0 and
   one `selftest:requested` message in the company mailbox. No fake backup
   failure or incident-state edit is used. The implementer did not send mail.
4. In a finally/cleanup step remove only `90-selftest.conf`, daemon-reload,
   verify normal ExecStart with no test flag. Never restart with the self-test
   override left installed. Enable/start the normal health timer after cleanup.

The same named runtime-override procedure with `--dry-run` runs checks without
mail, incident-state writes or creating locks. It deliberately emits no raw
status; exit0 means inspection completed, not that every finding was healthy.
Never supply both test/dry-run flags. Do not edit production status to test errors.

## Maintenance first run and weekly schedule

Use the exact maintenance service and its credential path. Parent can use a
temporary named runtime `90-dry-run.conf` ExecStart override with
`/usr/bin/python3 -I /opt/skm-site-backup/maintenance.py --dry-run`; remove that
exact override in cleanup, reload, verify normal ExecStart. Dry-run obtains
the existing shared backup.lock read-only, uses restic --no-lock/--no-cache
and prune --dry-run: no new snapshots, retention, repository or status changes.
If another backup holds the lock it skips without claiming a maintenance success.
Do not take an application lock from an interactive root command.

The normal cycle refuses unless repository path/ID and pinned restic match,
backup outcome is success/skipped, verified success is at most8h old and
full-read/real-restore proofs at most8days old. It takes the **same** backup.lock
for the whole operation, decrypts/verifies repository identity, records the
complete snapshot ID set, performs full read-data check, verifies identity
again, bounded prune, rechecks identity+read-data, then requires the exact
original snapshot ID set. No forget/init/unlock/repair/adopt command is present.
Retention remains solely in the backup cycle:28/30/8/12 unchanged.

After dry-run, parent runs one normal maintenance while proofs are fresh,
requires success and unchanged snapshot IDs, then enables/starts maintenance
timer (Sunday04:30UTC, persistent) and health timer. A lock collision skips;
the next scheduled run retries. A failed/incomplete maintenance must be
investigated, never automatically unlocked or repaired. Read-data under the
256MiB cap can fail closed as repository size grows; do not silently raise
caps or claim that the cap proves arbitrary future repository capacity.

## Refresh the sealed hosting recovery file manually

`seal-timeweb.mjs` is a manually invoked operator utility in the **current
deployed checkout**. It does not modify app startup or environment variables,
read a private owner key, start an SSH bridge, write plaintext files, or send
mail. It uses the running app's existing loopback15432 PostgreSQL bridge.
Copy the reviewed utility into its exact `deploy/backup/` path in that checkout
and give it only the owner's public `hosting-public-spki.txt` (base64 DER SPKI,
RSA at least3072bits). Do not copy the private key/DPAPI capsule to either server.

First freeze and review the final source commit. In a trusted checkout of that
exact commit, verify the complete 40-character lowercase Git SHA and clean
maintained-source state, then compute this read-only proof:

```sh
node deploy/backup/seal-timeweb.mjs --source-digest
```

This command reads only the maintained-source inventory below and prints its
SHA256/version/file count. It does not capture hosting environment, seal, or
connect to PostgreSQL. Compute it on the **final** reviewed source, including
this utility/tests; a later source edit invalidates the proof. Keep the runtime
stable during verification/capture, with no concurrent rollout or source edits.

In the actual Timeweb UI independently confirm the currently deployed release
is that **full** SHA, and compare the same source-only digest command in its
running source tree to the trusted checkout. An abbreviated f4d98f4, an operator
label, or merely the desired Git branch is not proof of the deployed commit.
If either UI release or maintained-source digest differs, stop. Do not invent
Git metadata, install a fake Git, or edit files just to make a label match.

If Git and its metadata are present, the original command remains supported:

```sh
node deploy/backup/seal-timeweb.mjs --owner-public-spki /protected/hosting-public-spki.txt
```

It reads real HEAD from this exact checkout (not a parent repository), and
records mode `git-head` plus the actual maintained-source digest. Either optional
verification flag, if supplied, must match; supplying both is recommended to
assert the independently reviewed release/tree. Git HEAD alone is not an
assertion that uncommitted files are absent; the digest is of actual maintained
files, and the independent expected digest binds the reviewed tree.

The Timeweb console may have Node24 and all source files but **no Git binary
and/or no .git metadata**. Only in that case use the verified fallback:

```sh
node deploy/backup/seal-timeweb.mjs --owner-public-spki /protected/hosting-public-spki.txt --verified-release VERIFIED_40_LOWERCASE_HEX --verified-source-digest VERIFIED_64_LOWERCASE_SHA256
```

Both flags are mandatory without Git. The utility recomputes the source digest
and refuses a mismatch **before** environment sealing or DB access. It records
mode `operator-verified`; the release is the operator's independently checked
Timeweb UI assertion, not a Git claim. Do not pass the above placeholder words.
Symlinked/special Git metadata always fails. When Git is available, corrupt
or wrong-root metadata is an error, not a reason to silently override HEAD. No actual secrets or environment values are
passed as command-line arguments. Actual REQUIRED/ALLOWED hosting settings must
still be supplied by the existing protected process environment; absent values
fail closed. This utility never enumerates or prints their raw values.

### Source inventory v1 (exact reproduction contract)

`tanitsu-maintained-source-v1` requires these seven nonsymlink source directories:
`app`, `components`, `lib`, `scripts`, `migrations`, `deploy`, `tests`. Each is
recursively walked. It also requires exactly these root files in the digest:
`package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`,
`tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `components.json`,
`proxy.ts`. Missing mandatory directories/files fail; they are not silently
omitted. All visited entries must be regular files/directories, never symlinks,
junctions, FIFOs, sockets or other special entries. This check runs before
filtering an encountered entry; excluded subtree contents are not traversed.
Opened source files must still identify the same regular file as lstat; an
observed file size/mtime change fails. Do not capture during deployment.

Within the seven directories only these **case-sensitive** text extensions
participate: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`,
`.css`, `.sql`, `.py`, `.sh`, `.service`, `.timer`, `.conf`, `.sudoers`, `.toml`,
`.yaml`, `.yml`. A basename starting `.env` is excluded. Subtrees named `.git`,
`.next`, `node_modules`, `__pycache__`, `.cache`, `coverage`, `generated`, `private`
or `docs` are excluded anywhere within these roots. Other file extensions
(including Markdown, binary assets, pyc/maps) and all other root files/trees
(including next-env.d.ts, tsbuildinfo, public assets, environment and build output)
are excluded. Never put maintained runtime code in an excluded location and
claim this digest covers it. This proves the declared maintained-source
inventory, not the complete filesystem, built assets or environment values.

Every included file is decoded as strict UTF-8 (BOM is preserved); CRLF and lone
CR are replaced by LF, and its resulting UTF-8 bytes are SHA256-hashed. Paths
are relative POSIX paths with exact case, sorted by JavaScript ordinal string
comparison, not locale. The final digest is SHA256 of the UTF-8 string:
`"tanitsu-maintained-source-v1\n" + JSON.stringify([[path, normalizedFileSha256], ...]) + "\n"`.
There are no timestamps, absolute paths or mode bits in it. Limits are 10000
included files, 16MiB per original file and 64MiB aggregate normalized text;
exceeding a limit refuses capture. The helper's --source-digest output is the
canonical way to reproduce this exact framed algorithm across LF/CRLF systems.

The capture encrypts actual present values from the explicit ALLOWED list;
REQUIRED must exist.
Capture includes auth/TOTP/admin selection, proxy peers, SSH bridge configuration
and optional existing deployment/public settings. It excludes arbitrary process
environment and the generated in-memory ingress token. The application derives
POSTGRES_URL/ingress token again on startup. It does not capture service uploads.

Encryption is random AES256-GCM with the key wrapped by RSA-OAEP-SHA256; the
release, capture time, sourceDigest and releaseVerification (mode plus inventory
version) are inside the authenticated ciphertext, together with env. The outer
format/algorithm is unchanged; decryptors must accept and verify these new
authenticated metadata fields, not just the public database release column. The envelope
keeps the existing `tanitsu-timeweb-sealed-v1` format. A transaction creates
**only** `public.skm_backup_sealed_capture_07b0dad5`, revokes PUBLIC and inserts
one row (id1, public release label, encrypted payload) using SQL parameters.
An existing table causes rollback; no upsert/drop/overwrite. Only fixed success,
release, public source digest, verification mode and ciphertext SHA256 are printed; failures print `skm_seal_failed`.
No raw values are interpolated into SQL or logs.

Parent's separately reviewed collection must follow this exact order, using
the source's privileged local PostgreSQL operator, not altered app code:

1. Read `release,payload` from that **exact** table with `WHERE id=1`; bound payload
   to65536bytes. Validate exact envelope fields/algorithm/format and strict base64
   (iv12bytes, tag16bytes, wrapped RSA key appropriate size, nonempty ciphertext).
   Require release and SHA256 equal the utility's recorded public proof.
2. Acquire the existing source export lock `/run/skm-site-export.lock` so collection
   does not race export. Validate nonsymlink/root-owned0755 ancestry of the fixed
   `/etc/skm-site-backup` directory. Preserve the current `timeweb-recovery.enc`
   unchanged as a root0600 versioned file named with its SHA256, created O_EXCL.
   If that version already exists, require matching bytes; never overwrite it.
3. Write the new ciphertext to a private temp file **in that same directory**,0600,
   flush+fsync. Preserve a SHA-named0600 version of the new ciphertext too. Rename
   atomically over only `/etc/skm-site-backup/timeweb-recovery.enc`, fsync directory,
   reread and verify exact bytes/SHA. Do not edit `common.py`/source allowlists:
   this fixed filename is already copied opaquely and authenticated in manifest.
4. Only after successful durable verification delete the scratch table in a
   transaction conditioned on the same row release/payload, then release lock.
   On any failure leave table and preserved old file for recovery; do not blind
   DROP another capture. Do not put versioned copies into the export allowlist.
5. Parent triggers one forced restore backup through the reviewed existing unit
   procedure. Record its exact snapshot/repo ID and
   `manifest.files["recovery/timeweb-recovery.enc"].sha256`; it must match the new
   ciphertext. Preserve old ciphertext and owner capsule; do not rotate either.
6. Owner decrypts **the packaged bytes from that exact snapshot**, using the
   existing DPAPI/private key in protected owner memory. Verify AES-GCM tag,
   release, capture time, sourceDigest and releaseVerification mode/inventory
   against the recorded independent proof, required names and equality with intended settings,
   without printing raw values. Record only decrypt passed/release/SHA/count.
   A new local ciphertext alone or filename equality is not this backup proof.

If the DB bridge or required env is unavailable, utility fails without changing
the encrypted file. No application restart or automatic capture hook is needed.
The parent must separately review and execute the collection; it is not run
by this implementation or the backup/monitor services.

## Local verification

Run Linux `SKM_TEST_RESTIC=/verified/restic python3 -m unittest discover -s tests
-p 'test*backup*.py' -v` and native Node `node --test tests/backup-*.test.mjs`.
The real-restic fixture initializes only its disposable local test repository,
creates garbage, verifies dry-run identity refusal, prunes, restores the kept
file and checks exact snapshot IDs. Fixtures stay below64MiB; no production
network, SMTP, credentials, active DAST, fuzzing, load or deploy is involved.
Native systemd syntax validation and unit contract tests do not demonstrate
native SMTP delivery or production memory use; parent records those separately.
Prune semantics: [official restic0.20 documentation](https://restic.readthedocs.io/en/stable/060_forget.html).
