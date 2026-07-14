"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createPrivacyRequest, type PrivacyRequestType } from "@/lib/privacy";

const schema = z.object({
  type: z.enum(["access", "correction", "deletion", "withdrawal"]),
  details: z.string().trim().max(1000).optional(),
});

export async function createPrivacyRequestAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Войдите в личный кабинет" };

  const parsed = schema.safeParse({ type: formData.get("type"), details: formData.get("details")?.toString() || undefined });
  if (!parsed.success) return { ok: false, message: "Проверьте тип и описание запроса" };

  await createPrivacyRequest(user.id, parsed.data.type as PrivacyRequestType, parsed.data.details);
  revalidatePath("/account");
  return { ok: true, message: "Запрос зарегистрирован" };
}
