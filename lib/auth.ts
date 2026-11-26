import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";
import crypto from "node:crypto";
import { dbGet, dbRun, dbTransaction, dbTxRun, getUserById, isAdminEmail, toPublicUser, type DbUser, type PublicDbUser } from "@/lib/db";

import { allowsAdminNetwork } from "@/lib/admin-network";

const COOKIE_NAME = "skm_session";
const ADMIN_COOKIE_NAME = "skm_admin_panel";
/** 7 дней в секундах — persistent cookie, не сессионная вкладка. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
export const ADMIN_PANEL_SESSION_MAX_AGE = 60 * 60 * 24;

type SessionPayload = {
  userId: number;
  email: string;
  role: DbUser["role"];
  exp: number;
  sid?: string;
};

type AdminPanelSessionPayload = {
  parent?: string;
  userId: number;
  exp: number;
  sid?: string;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value && usesSecureCookies()) {
    throw new Error("AUTH_SECRET is required in production");
  }

  return value ?? "skm-local-dev-secret-change-me";
}

function sign(value: string, purpose: "admin-panel-totp" | "authenticator-session" = "authenticator-session") {
  return crypto.createHmac("sha256", secret()).update(`${purpose}:${value}`).digest("base64url");
}

export function constantTimeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function usesSecureCookies() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: usesSecureCookies(),
    path: "/",
    maxAge: maxAgeSeconds,
    expires: new Date(Date.now() + maxAgeSeconds * 1000),
  };
}

function buildSessionValue(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function buildAdminPanelValue(payload: AdminPanelSessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, "admin-panel-totp")}`;
}

/** Устанавливает persistent cookie сессии на 7 дней. */
export async function createSession(user: DbUser) {
  const payload: SessionPayload = {
    sid: crypto.randomBytes(24).toString("base64url"),
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };

  const cookieStore = await cookies();
  const raw = buildSessionValue(payload);
  await registerSession(raw, payload.userId, payload.exp, "authenticator-session");
  cookieStore.set(COOKIE_NAME, raw, sessionCookieOptions(SESSION_MAX_AGE));
}

/** Продлевает срок жизни сессии. Вызывать только из Server Action / Route Handler. */
export async function refreshSessionCookie(user: DbUser) {
  const primary = await currentPrimary(user.id);
  if (!primary) return;
  const store = await cookies();
  const oldPanel = store.get(ADMIN_COOKIE_NAME)?.value;
  const panelPayload = readSignedCookie<AdminPanelSessionPayload>(oldPanel, "admin-panel-totp");
  const preservePanel = panelPayload?.userId === user.id && await hasAdminPanelAccess(user.id);
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const raw = buildSessionValue({ userId: user.id, email: user.email, role: "admin", exp,
    sid: crypto.randomBytes(24).toString("base64url") });
  const hash = sessionTokenHash(raw);
  const panel = preservePanel && panelPayload ? buildAdminPanelValue({ userId: user.id,
    exp: panelPayload.exp, parent: hash, sid: crypto.randomBytes(24).toString("base64url") }) : null;
  const result = await dbTransaction(async tx => {
    const revoked = await dbTxRun(tx, `UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`, [primary, new Date().toISOString()]);
    if (!revoked.changes) return null;
    let keepPanel = false;
    if (panel && oldPanel) {
      const retired = await dbTxRun(tx, `UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP
        WHERE token_hash = ? AND revoked_at IS NULL`, [sessionTokenHash(oldPanel)]);
      keepPanel = retired.changes === 1;
    }
    await dbTxRun(tx, `UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE parent_hash = ? AND revoked_at IS NULL`, [primary]);
    await dbTxRun(tx, `INSERT INTO admin_sessions (token_hash, user_id, purpose, expires_at)
      VALUES (?, ?, 'authenticator-session', ?) RETURNING token_hash`, [hash, user.id, new Date(exp * 1000).toISOString()]);
    if (keepPanel && panel && panelPayload) {
      await dbTxRun(tx, `INSERT INTO admin_sessions (token_hash, user_id, purpose, parent_hash, expires_at)
        VALUES (?, ?, 'admin-panel-totp', ?, ?) RETURNING token_hash`,
        [sessionTokenHash(panel), user.id, hash, new Date(panelPayload.exp * 1000).toISOString()]);
    }
    return { keepPanel };
  });
  if (!result) return;
  store.set(COOKIE_NAME, raw, sessionCookieOptions(SESSION_MAX_AGE));
  if (result.keepPanel && panel && panelPayload) {
    store.set(ADMIN_COOKIE_NAME, panel, sessionCookieOptions(panelPayload.exp - Math.floor(Date.now() / 1000)));
  }
}

export async function createAdminPanelSession(userId: number) {
  const primary = await currentPrimary(userId);
  if (!primary) throw new Error("Primary session required");
  const payload: AdminPanelSessionPayload = {
    sid: crypto.randomBytes(24).toString("base64url"),
    parent: primary,
    userId,
    exp: Math.floor(Date.now() / 1000) + ADMIN_PANEL_SESSION_MAX_AGE,
  };

  const cookieStore = await cookies();
  const raw = buildAdminPanelValue(payload);
  await registerSession(raw, userId, payload.exp, "admin-panel-totp", primary);
  cookieStore.set(ADMIN_COOKIE_NAME, raw, sessionCookieOptions(ADMIN_PANEL_SESSION_MAX_AGE));
}

export async function destroyAdminPanelSession() {
  await revokeCookie(ADMIN_COOKIE_NAME, "admin-panel-totp");
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function destroySession() {
  await revokeCookie(COOKIE_NAME, "authenticator-session");
  await revokeCookie(ADMIN_COOKIE_NAME, "admin-panel-totp");
  const cookieStore = await cookies();
  const expired = { ...sessionCookieOptions(0), maxAge: 0, expires: new Date(0) };
  cookieStore.set(COOKIE_NAME, "", expired);
  cookieStore.set(ADMIN_COOKIE_NAME, "", expired);
}

function readSignedCookie<T extends { exp: number; userId: number }>(raw: string | undefined, purpose: "admin-panel-totp" | "authenticator-session" = "authenticator-session") {
  if (!raw || raw.length > 2048 || raw.split(".").length !== 2) return null;

  const [body, signature] = raw.split(".");
  if (!body || !signature || !constantTimeEqual(signature, sign(body, purpose))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (!payload || typeof payload !== "object" || !Number.isSafeInteger(payload?.userId) || payload.userId < 1 || !Number.isSafeInteger(payload?.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hasAdminPanelAccess(userId: number) {
  if (!allowsAdminNetwork(await headers())) return false;
  const primary = await currentPrimary(userId);
  if (!primary) return false;
  const raw = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  const payload = readSignedCookie<AdminPanelSessionPayload>(raw, "admin-panel-totp");
  if (!raw || payload?.userId !== userId || (payload.parent && payload.parent !== primary)) return false;
  return registerSession(raw, userId, payload.exp, "admin-panel-totp", primary);
}

/**
 * Возвращает текущего пользователя. Обёрнуто в React cache():
 * повторные вызовы в рамках одного запроса не создают лишних обращений к БД.
 */
export const getCurrentUser = cache(async (): Promise<PublicDbUser | null> => {
  const cookieStore = await cookies();
  const payload = readSignedCookie<SessionPayload>(cookieStore.get(COOKIE_NAME)?.value);
  if (!payload || !allowsAdminNetwork(await headers())) return null;

  const user = await getUserById(payload.userId);
  if (!user || user.email !== payload.email || !isAdminEmail(user.email)) return null;
  if (!(await registerSession(cookieStore.get(COOKIE_NAME)!.value, user.id, payload.exp, "authenticator-session"))) return null;

  return toPublicUser({
    ...user,
    role: "admin",
  });
});

export function sessionTokenHash(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function registerSession(raw: string, userId: number, exp: number, purpose: string, parent: string | null = null) {
  if (!Number.isSafeInteger(userId) || userId < 1 || exp <= Math.floor(Date.now() / 1000)) return false;
  const token = sessionTokenHash(raw);
  await dbRun(`INSERT INTO admin_sessions (token_hash, user_id, purpose, parent_hash, expires_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT (token_hash) DO NOTHING RETURNING token_hash`,
    [token, userId, purpose, parent, new Date(exp * 1000).toISOString()]);
  const row = await dbGet<{ revoked_at: string | null; parent_hash: string | null }>(
    `SELECT revoked_at, parent_hash FROM admin_sessions WHERE token_hash = ? AND user_id = ? AND purpose = ?`, [token, userId, purpose]);
  // Never upsert revocation away. Expired cookies cannot recreate a deleted row.
  return Boolean(row && !row.revoked_at && row.parent_hash === parent);
}

async function currentPrimary(userId: number) {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  const payload = readSignedCookie<SessionPayload>(raw);
  if (!raw || payload?.userId !== userId || !allowsAdminNetwork(await headers())) return null;
  const user = await getUserById(userId);
  if (!user || !isAdminEmail(user.email) || user.email !== payload.email) return null;
  return await registerSession(raw, userId, payload.exp, "authenticator-session") ? sessionTokenHash(raw) : null;
}

async function revokeCookie(name: string, purpose: "authenticator-session" | "admin-panel-totp") {
  const raw = (await cookies()).get(name)?.value;
  const payload = readSignedCookie<AdminPanelSessionPayload>(raw, purpose);
  if (!raw || !payload) return;
  const parent = purpose === "admin-panel-totp" ? await currentPrimary(payload.userId) : null;
  // Register legacy material before revoking it, so logout also creates a tombstone.
  await registerSession(raw, payload.userId, payload.exp, purpose, parent);
  const hash = sessionTokenHash(raw);
  await dbRun(`UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND (token_hash = ? OR parent_hash = ?) AND revoked_at IS NULL`, [payload.userId, hash, hash]);
}

export async function currentSessionHash() {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  return raw ? sessionTokenHash(raw) : null;
}
