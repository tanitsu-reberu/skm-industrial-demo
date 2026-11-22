import { NextResponse } from "next/server";
import { dbGet } from "@/lib/db";
import { configuredAdminEmail } from "@/lib/site-config";
import { isAdminAuthenticatorConfigured } from "@/lib/totp";

export const runtime = "nodejs";

function safeErrorMessage(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/libsql:\/\/[^\s]+/gi, "libsql://[redacted]")
    .replace(/(password|token|secret|authorization)[^\s=]*\s*[=:]\s*[^\s]+/gi, "$1=[redacted]")
    .slice(0, 240);
}

export async function GET() {
  const email = configuredAdminEmail();
  if (!email || !isAdminAuthenticatorConfigured(email)) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  try {
    await dbGet("SELECT 1 FROM admin_totp_state LIMIT 1");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[health:otp] failed", {
      code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
      message: safeErrorMessage(error),
    });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
