import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import crypto from "node:crypto";
import { getUserById, isAdminEmail, toPublicUser, type DbUser, type PublicDbUser } from "@/lib/db";

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
};

type AdminPanelSessionPayload = {
  userId: number;
  exp: number;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value && usesSecureCookies()) {
    throw new Error("AUTH_SECRET is required in production");
  }

  return value ?? "skm-local-dev-secret-change-me";
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function hashOtp(email: string, code: string) {
  return crypto
    .createHmac("sha256", secret())
    .update(`${email.toLowerCase()}:${code}`)
    .digest("hex");
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
  return `${body}.${sign(body)}`;
}

/** Устанавливает persistent cookie сессии на 7 дней. */
export async function createSession(user: DbUser) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, buildSessionValue(payload), sessionCookieOptions(SESSION_MAX_AGE));
}

/** Продлевает срок жизни сессии. Вызывать только из Server Action / Route Handler. */
export async function refreshSessionCookie(user: DbUser) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: isAdminEmail(user.email) ? "admin" : "user",
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, buildSessionValue(payload), sessionCookieOptions(SESSION_MAX_AGE));
}

export async function createAdminPanelSession(userId: number) {
  const payload: AdminPanelSessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + ADMIN_PANEL_SESSION_MAX_AGE,
  };

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, buildAdminPanelValue(payload), sessionCookieOptions(ADMIN_PANEL_SESSION_MAX_AGE));
}

export async function destroyAdminPanelSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const expired = { ...sessionCookieOptions(0), maxAge: 0, expires: new Date(0) };
  cookieStore.set(COOKIE_NAME, "", expired);
  cookieStore.set(ADMIN_COOKIE_NAME, "", expired);
}

function readSignedCookie<T extends { exp: number }>(raw: string | undefined) {
  if (!raw) return null;

  const [body, signature] = raw.split(".");
  if (!body || !signature || !constantTimeEqual(signature, sign(body))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hasAdminPanelAccess(userId: number) {
  const cookieStore = await cookies();
  const payload = readSignedCookie<AdminPanelSessionPayload>(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
  return payload?.userId === userId;
}

/**
 * Возвращает текущего пользователя. Обёрнуто в React cache():
 * повторные вызовы в рамках одного запроса не создают лишних обращений к БД.
 */
export const getCurrentUser = cache(async (): Promise<PublicDbUser | null> => {
  const cookieStore = await cookies();
  const payload = readSignedCookie<SessionPayload>(cookieStore.get(COOKIE_NAME)?.value);
  if (!payload) return null;

  const user = await getUserById(payload.userId);
  if (!user) return null;

  return toPublicUser({
    ...user,
    role: isAdminEmail(user.email) ? "admin" : "user",
  });
});
