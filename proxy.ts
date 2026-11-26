import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { allowsAdminNetwork } from "@/lib/admin-network";

const SESSION_COOKIE_NAME = "skm_session";

type SessionPayload = {
  userId: number;
  exp: number;
};

function authSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }

  return value ?? "skm-local-dev-secret-change-me";
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`authenticator-session:${value}`));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function readSession(raw: string | undefined) {
  if (!raw) return null;

  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(await sign(body));
  const supplied = Buffer.from(signature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as SessionPayload;
    if (!payload.userId || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const protectedPath = /^\/(login|admin|api\/session)(\/|$)/.test(request.nextUrl.pathname);
  if (protectedPath && !allowsAdminNetwork(request.headers)) {
    return new NextResponse(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Вход недоступен</title><p>Вход доступен с подключений из России.</p><p><a href="https://db-ip.com">Геолокация по IP от DB-IP</a></p></html>', {
      status: 403,
      headers: { "Cache-Control": "private, no-store", "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (request.nextUrl.pathname.startsWith("/admin")) {
    const session = await readSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
  }

  const pathname = request.nextUrl.pathname;
  const publicAsset = /^(?:\/api\/uploads\/services\/[^/]+\.(?:png|jpe?g|webp|avif)|\/logo\.(?:png|webp|svg)|\/icon\.png|\/apple-touch-icon\.png|\/sw\.js|\/robots\.txt|\/sitemap\.xml|\/manifest\.webmanifest|\/\.well-known\/security\.txt|\/documents\/[^/]+\.docx|\/services\/[^/]+\.(?:webp|svg|png|jpe?g|avif|ico))$/.test(pathname);
  if (publicAsset) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
