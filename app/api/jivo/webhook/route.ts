import { NextResponse } from "next/server";
import { saveChatEvent, notifyTelegramAboutChatEvent } from "@/lib/jivo-server";
import type { JivoContext } from "@/lib/jivo-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function pickNestedString(record: UnknownRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = record;
    for (const segment of path) current = asRecord(current)[segment];
    const value = asString(current).trim();
    if (value) return value;
  }

  return "";
}

function extractContext(payload: UnknownRecord): { eventName: string; chatId: string | null; context: JivoContext } {
  const eventName =
    pickNestedString(payload, [["event_name"], ["event"], ["type"], ["name"]]) || "webhook";

  const chatId =
    pickNestedString(payload, [["chat_id"], ["chatId"], ["chat", "id"], ["conversation", "id"]]) || null;

  const visitorName = pickNestedString(payload, [
    ["visitor", "name"],
    ["client", "name"],
    ["contact", "name"],
    ["name"],
  ]);
  const visitorEmail = pickNestedString(payload, [
    ["visitor", "email"],
    ["client", "email"],
    ["contact", "email"],
    ["email"],
  ]);
  const visitorPhone = pickNestedString(payload, [
    ["visitor", "phone"],
    ["client", "phone"],
    ["contact", "phone"],
    ["phone"],
  ]);
  const pageUrl = pickNestedString(payload, [
    ["page", "url"],
    ["url"],
    ["visitor", "url"],
  ]);
  const pageTitle = pickNestedString(payload, [
    ["page", "title"],
    ["title"],
  ]);

  return {
    eventName,
    chatId,
    context: {
      source: "jivo-webhook",
      name: visitorName || undefined,
      email: visitorEmail || undefined,
      phone: visitorPhone || undefined,
      pageUrl: pageUrl || undefined,
      pageTitle: pageTitle || undefined,
    },
  };
}

function buildTelegramMessage(eventName: string, chatId: string | null, context: JivoContext) {
  const lines = [
    "Новый сигнал из JivoChat",
    `Событие: ${eventName}`,
    chatId ? `Чат: ${chatId}` : "",
    context.name ? `Имя: ${context.name}` : "",
    context.phone ? `Телефон: ${context.phone}` : "",
    context.email ? `Email: ${context.email}` : "",
    context.pageTitle ? `Страница: ${context.pageTitle}` : "",
    context.pageUrl ? `URL: ${context.pageUrl}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export async function POST(request: Request) {
  const secret = process.env.JIVO_WEBHOOK_SECRET?.trim();
  const requestUrl = new URL(request.url);
  const providedSecret = request.headers.get("x-skm-jivo-secret") ?? requestUrl.searchParams.get("secret");

  if (secret && providedSecret !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const payload = asRecord(await request.json().catch(() => ({})));
  const { eventName, chatId, context } = extractContext(payload);

  await saveChatEvent({
    eventName,
    chatId,
    context,
    source: "jivo-webhook",
    payload,
  });

  if (eventName !== "agent_message" && eventName !== "message_from_agent") {
    await notifyTelegramAboutChatEvent(buildTelegramMessage(eventName, chatId, context));
  }

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
