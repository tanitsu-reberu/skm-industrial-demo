import { NextResponse } from "next/server";
import { dbGet } from "@/lib/db";
import { isResendConfigured } from "@/lib/resend";

export const runtime = "nodejs";

export async function GET() {
  try {
    const row = await dbGet<{ c: number }>("SELECT COUNT(*) AS c FROM otp_codes");
    return NextResponse.json({
      ok: true,
      otpCount: row?.c ?? null,
      resendConfigured: isResendConfigured(),
      hasTursoUrl: Boolean(process.env.TURSO_DATABASE_URL),
      hasTursoToken: Boolean(process.env.TURSO_AUTH_TOKEN),
      otpFrom: process.env.OTP_FROM_EMAIL ?? null,
    });
  } catch (error) {
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