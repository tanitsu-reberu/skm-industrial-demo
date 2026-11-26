# SKM audit closure — 2026-11-26

Production web: Timeweb App Platform, branch `tanitsu/timeweb-release-20261122`. Database: PostgreSQL18.6 `skm_site` on company homeserver, accessed through the restricted SSH bridge. TOTP plus secondary admin password. Public financial/account flows removed. Contacts are stored locally and mailed to i@ooo-skmoscow.ru by the homeserver Python worker.

Implementation scope: hashed server sessions with legacy-cookie adoption and individual revocation; persistent security events; mail retry visibility; trusted minimal request diagnostics; bounded contact pagination; checksummed additive migrations and explicit UTC conversion; bounded ephemeral retention and optional backed-up empty legacy retirement; compatible stronger async password hashing; mailer syscall filter; obsolete tool cleanup; dynamic-response compression control.

State: local implementation and synthetic verification; parent owns independent review, production backup/restore evidence, staged migration, worker rollout, final web deployment and live session/compression checks. See deploy/AUDIT-CLOSURE.md and tests/run-closure.cjs. No SCADA changes.
