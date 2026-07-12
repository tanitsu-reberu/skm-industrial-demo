import "server-only";

import { dbRun } from "@/lib/db";
import type { JivoContext, JivoEventName } from "@/lib/jivo-context";

type SaveChatEventInput = {
  eventName: JivoEventName | string;
  userId?: number | null;
  context?: JivoContext;
  chatId?: string | null;
  source?: string;
  payload?: unknown;
};

function truncate(value: unknown, max = 500) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

function safeJson(value: unknown) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value).slice(0, 20_000);
  } catch {
    return null;
  }
}

export async function saveChatEvent({
  eventName,
  userId = null,
  context,
  chatId = null,
  source = "jivo",
  payload,
}: SaveChatEventInput) {
  await dbRun(
    `INSERT INTO chat_events (
      event_name, user_id, visitor_name, visitor_email, visitor_phone,
      page_url, page_title, service_slug, service_title, order_id, chat_id, source, payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      truncate(eventName, 80),
      userId,
      truncate(context?.name, 160),
      truncate(context?.email, 200),
      truncate(context?.phone, 80),
      truncate(context?.pageUrl, 1000),
      truncate(context?.pageTitle, 300),
      truncate(context?.serviceSlug, 200),
      truncate(context?.serviceTitle, 300),
      context?.orderId ?? null,
      truncate(chatId, 160),
      truncate(source, 80) ?? "jivo",
      safeJson(payload ?? context ?? null),
    ],
  );
}

export async function notifyTelegramAboutChatEvent(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) return { sent: false };

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  return { sent: response.ok };
}
