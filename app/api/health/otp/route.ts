import { NextResponse } from "next/server";
import { dbGet } from "@/lib/db";
import { isResendConfigured } from "@/lib/resend";

export const runtime = "nodejs";

function safeErrorMessage(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/libsql:\/\/[^\s]+/gi, "libsql://[redacted]")
    .replace(/(password|token|secret|authorization)[^\s=]*\s*[=:]\s*[^\s]+/gi, "$1=[redacted]")
    .slice(0, 240);
}

export async function GET() {
  try {
    const row = await dbGet<{ c: number }>("SELECT COUNT(*) AS c FROM otp_codes");
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({
      ok: true,
      otpCount: row?.c ?? null,
      resendConfigured: isResendConfigured(),
      hasTursoUrl: Boolean(process.env.TURSO_DATABASE_URL),
      hasTursoToken: Boolean(process.env.TURSO_AUTH_TOKEN),
      otpFrom: process.env.OTP_FROM_EMAIL ?? null,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error("[health:otp] failed", {
        code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
        message: safeErrorMessage(error),
        hasPostgresUrl: Boolean(process.env.POSTGRES_URL),
        hasTursoUrl: Boolean(process.env.TURSO_DATABASE_URL),
      });
      return NextResponse.json(
        {
          ok: false,
          code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
          message: safeErrorMessage(error),
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        hasTursoUrl: Boolean(process.env.TURSO_DATABASE_URL),
        hasTursoToken: Boolean(process.env.TURSO_AUTH_TOKEN),
        resendConfigured: isResendConfigured(),
      },
      { status: 500 },
    );
  }
}
