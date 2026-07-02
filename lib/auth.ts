import "server-only";

import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getUserById, isAdminEmail, type DbUser } from "@/lib/db";

const COOKIE_NAME = "skm_session";
const maxAge = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: number;
  email: string;
  role: DbUser["role"];
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

export async function createSession(user: DbUser) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + maxAge,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const value = `${body}.${sign(body)}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [body, signature] = raw.split(".");
  if (!body || !signature || !constantTimeEqual(signature, sign(body))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const user = getUserById(payload.userId);
    if (!user) return null;
    return {
      ...user,
      role: isAdminEmail(user.email) ? "admin" : "user",
    } satisfies DbUser;
  } catch {
    return null;
  }
}
