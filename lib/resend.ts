import "server-only";

import { Resend } from "resend";

/** Читает RESEND_API_KEY из переменных окружения (.env.local / Vercel). */
function apiKey() {
  const value = process.env.RESEND_API_KEY?.trim();
  if (!value || value === "твой_ключ" || value === "your_resend_api_key" || value === "re_your_resend_api_key") {
    return null;
  }
  return value;
}

export function isResendConfigured() {
  return Boolean(apiKey());
}

export const resend = apiKey() ? new Resend(apiKey() ?? undefined) : null;

