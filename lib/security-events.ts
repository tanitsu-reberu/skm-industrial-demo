import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { dbGet, dbRun } from "@/lib/db";

export type SecurityEvent = "auth.totp" | "auth.password" | "password.setup" | "password.rehash" |
  "session.logout" | "session.panel_close" | "session.revoke" | "contact.status" | "contact.delete" |
  "service.create" | "service.update" | "service.delete" | "service.upload";

export async function requestDiagnostics() {
  const values = await headers();
  const token = process.env.ADMIN_GEO_PROXY_TOKEN;
  const supplied = values.get("x-skm-geo-token") ?? "";
  const ip = values.get("x-skm-client-ip") ?? "";
  if (!token || token.length < 43 || token.length !== supplied.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(supplied)) || !isIP(ip)) {
    return { ipHash: null, agent: null };
  }
  const day = new Date().toISOString().slice(0, 10);
  const agent = (values.get("user-agent") ?? "").slice(0, 1024);
  const browser = /Firefox\//.test(agent) ? "Firefox" : /Edg\//.test(agent) ? "Edge" :
    /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Other";
  const platform = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" :
    /Windows/.test(agent) ? "Windows" : /Macintosh/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "Other";
  return {
    ipHash: createHmac("sha256", process.env.AUTH_SECRET ?? token).update(`diagnostic:${day}:${ip}`).digest("hex"),
    agent: `${browser}/${platform}`,
  };
}

export async function recordSecurityEvent(event: SecurityEvent, outcome: "success" | "failure" | "denied",
  actorId: number | null = null, target?: number | string) {
  if (event.startsWith("auth.") && outcome !== "success") {
    // Fixed keys per factor/outcome/known actor; never attacker-controlled IP or form input.
    // Keep failure evidence without turning rejected anonymous traffic into unbounded log writes.
    const minute = Math.floor(Date.now() / 60_000);
    const limit = outcome === "denied" ? 1 : 10;
    const admitted = await dbGet<{ attempts: number }>(`INSERT INTO admin_totp_state (email, attempt_window, attempts)
      VALUES (?, ?, 1) ON CONFLICT (email) DO UPDATE SET
        attempts = CASE WHEN admin_totp_state.attempt_window = excluded.attempt_window
          THEN admin_totp_state.attempts + 1 ELSE 1 END,
        attempt_window = excluded.attempt_window
      WHERE admin_totp_state.attempt_window < excluded.attempt_window
        OR (admin_totp_state.attempt_window = excluded.attempt_window AND admin_totp_state.attempts < ?)
      RETURNING attempts`, [`audit:${event}:${outcome}:${actorId ?? 0}`, minute, limit]);
    if (!admitted) return;
  }
  const { ipHash, agent } = await requestDiagnostics();
  const safeTarget = target !== undefined && /^(?:\d{1,16}|[a-f0-9]{64})$/.test(String(target)) ? String(target) : null;
  await dbRun(`INSERT INTO admin_security_events (actor_id, event_type, outcome, target_id, ip_hash, agent)
    VALUES (?, ?, ?, ?, ?, ?)`, [actorId, event, outcome, safeTarget, ipHash, agent]);
}
