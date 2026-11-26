"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasAdminPanelAccess, currentSessionHash, destroySession } from "@/lib/auth";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security-events";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin?.role === "admin" && await hasAdminPanelAccess(admin.id) ? admin : null;
}

export async function revokeAdminSessionAction(form: FormData) {
  const admin = await requireAdmin();
  const hash = form.get("sessionHash");
  if (!admin || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return;
  const result = await dbRun(`UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND (token_hash = ? OR parent_hash = ?) AND revoked_at IS NULL`, [admin.id, hash, hash]);
  try { await recordSecurityEvent("session.revoke", result.changes ? "success" : "failure", admin.id, hash); }
  catch { console.error("[security-audit] session revocation log unavailable"); }
  finally { if (hash === await currentSessionHash()) await destroySession(); }
  revalidatePath("/admin");
}

export async function getAdminSecuritySnapshot(before?: string, sessionBefore?: string) {
  const admin = await requireAdmin();
  if (!admin) return null;
  const cursor = before && /^\d{1,15}$/.test(before) ? Number(before) : Number.MAX_SAFE_INTEGER;
  const sessionCursor = sessionBefore && /^[a-f0-9]{64}$/.test(sessionBefore) ? sessionBefore : "z";
  const sessions = await dbAll<{ token_hash: string; created_at: string; expires_at: string; revoked_at: string | null }>(
    `SELECT token_hash, created_at, expires_at, revoked_at FROM admin_sessions
      WHERE user_id = ? AND purpose = 'authenticator-session' AND expires_at > ? AND token_hash < ?
      ORDER BY token_hash DESC LIMIT 26`, [admin.id, new Date().toISOString(), sessionCursor]);
  const events = await dbAll<{ id: number; event: string; outcome: string; target: string | null;
    actor_id: number | null; agent: string | null; created_at: string }>(
    `SELECT id, event_type AS event, outcome, target_id AS target, actor_id, agent, created_at FROM admin_security_events
      WHERE id < ? ORDER BY id DESC LIMIT 51`, [cursor]);
  const total = await dbGet<{ total: number }>("SELECT COUNT(*) AS total FROM admin_security_events");
  return { sessions: sessions.slice(0, 25), sessionNext: sessions.length > 25 ? sessions[24].token_hash : null,
    events: events.slice(0, 50), next: events.length > 50 ? events[49].id : null,
    total: Number(total?.total ?? 0), currentHash: await currentSessionHash() };
}
