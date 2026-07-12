import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { saveChatEvent } from "@/lib/jivo-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const contextSchema = z
  .object({
    source: z.string().max(120).optional(),
    action: z.string().max(200).optional(),
    name: z.string().max(160).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(80).optional(),
    description: z.string().max(500).optional(),
    pageTitle: z.string().max(300).optional(),
    pageUrl: z.string().max(1000).optional(),
    serviceSlug: z.string().max(200).optional(),
    serviceTitle: z.string().max(300).optional(),
    orderId: z.coerce.number().int().positive().optional(),
    amount: z.coerce.number().int().positive().optional(),
    customData: z.array(z.any()).max(10).optional(),
  })
  .passthrough()
  .optional();

const eventSchema = z.object({
  eventName: z.enum(["open", "first_message", "client_start_chat", "contact_sent", "agent_message_received"]),
  context: contextSchema,
});

export async function POST(request: Request) {
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const user = await getCurrentUser();
  await saveChatEvent({
    eventName: parsed.data.eventName,
    userId: user?.id ?? null,
    context: parsed.data.context,
    source: "site",
    payload: parsed.data,
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
