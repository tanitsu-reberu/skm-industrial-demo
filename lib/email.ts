import "server-only";

import { resend, isResendConfigured } from "@/lib/resend";

type OtpEmailInput = {
  email: string;
  code: string;
  expiresInMinutes: number;
};

/** Адрес отправителя OTP-писем. Задаётся через OTP_FROM_EMAIL в .env / Vercel. */
const defaultFrom = "СКМ <no-reply@service-skm.ru>";

function otpFromAddress() {
  return process.env.OTP_FROM_EMAIL?.trim() || defaultFrom;
}

function buildOtpEmailContent(code: string, expiresInMinutes: number) {
  const subject = "Код подтверждения SKM";
  const text = [
    "Код подтверждения для входа или регистрации на сайте SKM:",
    code,
    "",
    `Код действует ${expiresInMinutes} минут.`,
    "Если вы не запрашивали код, просто удалите это письмо.",
  ].join("\n");

  const html = `
    <div style="margin:0;background:#0A0A0A;padding:32px;font-family:Arial,sans-serif;color:#FFFFFF">
      <div style="max-width:560px;margin:0 auto;border:1px solid #27272A;background:#18181B;border-radius:12px;padding:28px">
        <p style="margin:0 0 8px;color:#A1A1AA;font-size:13px;letter-spacing:0.12em;text-transform:uppercase">ООО СКМ</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#FFFFFF">Код подтверждения</h1>
        <p style="margin:0 0 20px;color:#A1A1AA;font-size:15px;line-height:1.6">
          Введите этот код на сайте для входа в личный кабинет или регистрации. Код действует ${expiresInMinutes} минут.
        </p>
        <div style="margin:0 0 20px;padding:20px;border:1px solid #27272A;border-radius:10px;background:#121212;text-align:center">
          <span style="font-size:36px;line-height:1;font-weight:700;letter-spacing:0.28em;color:#FFFFFF">${code}</span>
        </div>
        <p style="margin:0;color:#A1A1AA;font-size:13px;line-height:1.6">
          Если вы не запрашивали код, письмо можно удалить.
        </p>
        <div style="height:3px;background:#E30613;border-radius:999px;margin-top:24px"></div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

/**
 * Отправляет 6-значный OTP-код через Resend.
 * Вызывается из requestOtpAction (lib/actions.ts) при входе и регистрации.
 */
export async function sendOtpEmail({ email, code, expiresInMinutes }: OtpEmailInput) {
  if (!isResendConfigured() || !resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured");
    }

    console.log(`[SKM OTP] ${email}: ${code} (${expiresInMinutes} min)`);
    return { delivered: false, demoCode: code };
  }

  const from = otpFromAddress();
  const { subject, text, html } = buildOtpEmailContent(code, expiresInMinutes);

  // Точка отправки письма через Resend API
  const result = await resend.emails.send({
    from,
    to: email,
    subject,
    html,
    text,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { delivered: true, demoCode: undefined };
}