import "server-only";

import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getUserById, isAdminEmail, toPublicUser, type DbUser, type PublicDbUser } from "@/lib/db";

const COOKIE_NAME = "skm_session";
const ADMIN_COOKIE_NAME = "skm_admin_panel";
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
  return process.env.AUTH_SECRET ?? "skm-local-dev-secret-change-me";
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

function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(user: DbUser) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const value = `${body}.${sign(body)}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, sessionCookieOptions(SESSION_MAX_AGE));
}

export async function createAdminPanelSession(userId: number) {
  const payload: AdminPanelSessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + ADMIN_PANEL_SESSION_MAX_AGE,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const value = `${body}.${sign(body)}`;

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, value, sessionCookieOptions(ADMIN_PANEL_SESSION_MAX_AGE));
}

export async function destroyAdminPanelSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(ADMIN_COOKIE_NAME);
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

export async function getCurrentUser(): Promise<PublicDbUser | null> {
  const cookieStore = await cookies();
  const payload = readSignedCookie<SessionPayload>(cookieStore.get(COOKIE_NAME)?.value);
  if (!payload) return null;

  const user = await getUserById(payload.userId);
  if (!user) return null;

  return toPublicUser({
    ...user,
    role: isAdminEmail(user.email) ? "admin" : "user",
  });
}
