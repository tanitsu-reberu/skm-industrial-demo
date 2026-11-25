"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contactConsentVersion, contactRequestsEnabled, hasPrivacyConsent, privacyConsentMessage, privacyConsentVersion } from "@/lib/privacy-policy";
import {
  createAdminPanelSession,
  createSession,
  destroyAdminPanelSession,
  destroySession,
  getCurrentUser,
  hasAdminPanelAccess,
} from "@/lib/auth";
import { createHash } from "node:crypto";
import { dbGet, dbAll, dbRun, getAdminPanelPasswordHash, hasAdminPanelPassword, setAdminPanelPassword, type DbContactRequest, upsertUserByEmail } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { verifyAdminAuthenticator } from "@/lib/totp";
import { configuredAdminEmail } from "@/lib/site-config";
import { allowsAdminNetwork } from "@/lib/admin-network";
import { headers } from "next/headers";

export type ActionResult = { ok: boolean; message: string };
export type AdminSnapshot = { contactRequests: DbContactRequest[] };

const contactRequestStatusSchema = z.enum(["new", "in_progress", "processed"]);

const adminPanelPasswordSchema = z.string().min(8, "Пароль должен быть не короче 8 символов").max(128);

async function reserveAttempt(scope: string, milliseconds: number, limit: number) {
  const window = Math.floor(Date.now() / milliseconds);
  const result = await dbGet<{ attempts: number }>(
    `INSERT INTO admin_totp_state (email, attempt_window, attempts)
     VALUES (?, ?, 1)
     ON CONFLICT (email) DO UPDATE SET
       attempts = CASE WHEN admin_totp_state.attempt_window = excluded.attempt_window
                       THEN admin_totp_state.attempts + 1 ELSE 1 END,
       attempt_window = excluded.attempt_window
     WHERE admin_totp_state.attempt_window < excluded.attempt_window
        OR (admin_totp_state.attempt_window = excluded.attempt_window AND admin_totp_state.attempts < ?)
     RETURNING attempts`, [scope, window, limit]);
  return Boolean(result);
}

async function requireAdmin() {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return null;
  if (!(await hasAdminPanelAccess(admin.id))) return null;
  return admin;
}

export async function getAdminPanelAccessState() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { isAdmin: false, hasPassword: false, hasAccess: false };
  }

  const [hasPassword, hasAccess] = await Promise.all([
    hasAdminPanelPassword(user.id),
    hasAdminPanelAccess(user.id),
  ]);

  return { isAdmin: true, hasPassword, hasAccess };
}

export async function setupAdminPanelPasswordAction(formData: FormData): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return { ok: false, message: "Недостаточно прав" };
  if (await hasAdminPanelPassword(admin.id)) return { ok: false, message: "Пароль админ-панели уже установлен" };

  const password = adminPanelPasswordSchema.safeParse(formData.get("password"));
  const confirm = z.string().safeParse(formData.get("confirm"));
  if (!password.success) return { ok: false, message: password.error.issues[0]?.message ?? "Проверьте пароль" };
  if (!confirm.success || confirm.data !== password.data) {
    return { ok: false, message: "Пароли не совпадают" };
  }

  if (!(await setAdminPanelPassword(admin.id, hashPassword(password.data)))) {
    return { ok: false, message: "Пароль админ-панели уже установлен" };
  }
  await createAdminPanelSession(admin.id);

  revalidatePath("/admin");
  return { ok: true, message: "Пароль установлен. Доступ к админ-панели открыт." };
}

export async function verifyAdminPanelPasswordAction(formData: FormData): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return { ok: false, message: "Недостаточно прав" };

  const password = z.string().min(1, "Введите пароль").max(128).safeParse(formData.get("password"));
  if (!password.success) return { ok: false, message: password.error.issues[0]?.message ?? "Введите пароль" };

  const storedHash = await getAdminPanelPasswordHash(admin.id);
  if (!storedHash) return { ok: false, message: "Сначала установите пароль админ-панели" };
  if (!(await reserveAttempt("panel:" + admin.id, 300_000, 10))) return { ok: false, message: "Попробуйте позже." };
  if (!verifyPassword(password.data, storedHash)) return { ok: false, message: "Неверный пароль админ-панели" };

  await createAdminPanelSession(admin.id);

  revalidatePath("/admin");
  return { ok: true, message: "Доступ к админ-панели открыт на 24 часа." };
}

export async function revokeAdminPanelAccessAction() {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return { ok: false, message: "Недостаточно прав" } satisfies ActionResult;

  await destroyAdminPanelSession();

  revalidatePath("/admin");
  return { ok: true, message: "Доступ к админ-панели закрыт." };
}

const contactRequestSchema = z.object({
  name: z.string().trim().max(120),
  phone: z.string().trim().min(7).max(32).regex(/^\+?[0-9 ()-]+$/).refine(value => value.replace(/\D/g, "").length >= 7),
  email: z.union([z.literal(""), z.string().trim().max(254).email()]),
  comment: z.string().trim().max(1200),
});

export async function createContactRequestAction(formData: FormData): Promise<ActionResult> {
  if (!contactRequestsEnabled) return { ok: false, message: "Приём заявок через сайт пока закрыт." };
  if (formData.get("privacyConsent") !== "on") return { ok: false, message: privacyConsentMessage };
  if (formData.get("consentVersion") !== contactConsentVersion) {
    return { ok: false, message: "Обновите страницу и ознакомьтесь с актуальным согласием." };
  }

  const input = contactRequestSchema.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone"),
    email: formData.get("email") ?? "",
    comment: formData.get("comment") ?? "",
  });
  if (!input.success) return { ok: false, message: "Проверьте телефон, email и длину полей." };

  const { name, phone, email, comment } = input.data;
  try {
    if (!(await reserveAttempt("contact:global", 60_000, 30))) return { ok: false, message: "Попробуйте через минуту." };
    const fingerprint = createHash("sha256").update(JSON.stringify([name, phone.replace(/\D/g, ""), email, comment])).digest("hex");
    if (!(await reserveAttempt("contact:" + fingerprint, 60_000, 1))) return { ok: false, message: "Повторная заявка. Попробуйте через минуту." };
    await dbRun(
      `INSERT INTO contact_requests (name, phone, email, comment, consent_version, consented_at, mail_next_attempt_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [name || null, phone, email || null, comment, contactConsentVersion],
    );
  } catch {
    console.error("[contact-request] database write failed");
    return { ok: false, message: "Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам." };
  }

  return { ok: true, message: "Заявка отправлена. Мы свяжемся с вами." };
}

export async function verifyAuthenticatorAction(formData: FormData): Promise<ActionResult> {
  if (!allowsAdminNetwork(await headers())) {
    return { ok: false, message: "Вход недоступен с этого подключения." };
  }

  const email = configuredAdminEmail();
  const code = z.string().regex(/^\d{6}$/).safeParse(formData.get("code"));
  if (!email || !code.success) return { ok: false, message: "Введите шестизначный код." };
  if (!hasPrivacyConsent(formData)) return { ok: false, message: privacyConsentMessage };

  try {
    if (!(await verifyAdminAuthenticator(email, code.data))) {
      return { ok: false, message: "Код не принят. Проверьте время на устройстве и попробуйте с новым кодом позже." };
    }

    await dbRun(
      `INSERT INTO admin_privacy_consents (email, consent_version)
       VALUES (?, ?)
       ON CONFLICT (email, consent_version) DO UPDATE SET received_at = CURRENT_TIMESTAMP`,
      [email, `${privacyConsentVersion}-totp`],
    );
    await createSession(await upsertUserByEmail(email));
    revalidatePath("/admin");
    return { ok: true, message: "Вход выполнен" };
  } catch (error) {
    console.error("[SKM TOTP] verification failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, message: "Не удалось проверить код. Попробуйте позже." };
  }
}

export async function logoutAction() {
  await destroySession();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function updateContactRequestStatusAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const requestId = z.coerce.number().int().positive().safeParse(formData.get("requestId"));
  const status = contactRequestStatusSchema.safeParse(formData.get("status"));
  if (!requestId.success || !status.success) return { ok: false, message: "Проверьте заявку и статус" };

  const result = await dbRun("UPDATE contact_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
    status.data,
    requestId.data,
  ]);

  revalidatePath("/admin");
  return result.changes ? { ok: true, message: "Статус заявки обновлен" } : { ok: false, message: "Заявка не найдена" };
}

export async function deleteContactRequestAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const requestId = z.coerce.number().int().positive().safeParse(formData.get("requestId"));
  if (!requestId.success) return { ok: false, message: "Проверьте заявку" };

  const result = await dbRun("DELETE FROM contact_requests WHERE id = ?", [requestId.data]);
  revalidatePath("/admin");
  return result.changes ? { ok: true, message: "Заявка удалена" } : { ok: false, message: "Заявка не найдена" };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  if (!(await requireAdmin())) return { contactRequests: [] };
  return { contactRequests: await dbAll<DbContactRequest>("SELECT * FROM contact_requests ORDER BY created_at DESC, id DESC") };
}
