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
import {
  dbAll,
  dbGet,
  dbRun,
  dbTransaction,
  dbTxGet,
  dbTxRun,
  getAdminPanelPasswordHash,
  hasAdminPanelPassword,
  setAdminPanelPassword,
  type DbInvoice,
  type DbContactRequest,
  type DbOrder,
  type DbPayment,
  type DbServiceInvoiceRequest,
  type DbTopupRequest,
  type DbUser,
  type PublicDbUser,
  upsertUserByEmail,
} from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { verifyAdminAuthenticator } from "@/lib/totp";
import { configuredAdminEmail } from "@/lib/site-config";
import { allowsAdminNetwork } from "@/lib/admin-network";
import { headers } from "next/headers";

export type ActionResult = {
  ok: boolean;
  message: string;
  /** Новый статус заявки после действия админа. */
  requestStatus?: DbTopupRequest["status"];
  order?: DbOrder;
  invoice?: DbInvoice;
  payment?: DbPayment;
};

export type AdminUserRow = PublicDbUser & {
  last_topup_at: string | null;
  last_activity_at: string | null;
  last_order_at: string | null;
  last_order_title: string | null;
  total_orders: number;
  total_spent: number;
};

export type AdminSnapshot = {
  users: AdminUserRow[];
  orders: DbOrder[];
  invoices: DbInvoice[];
  payments: DbPayment[];
  serviceInvoiceRequests: Array<DbServiceInvoiceRequest & { email: string }>;
  contactRequests: DbContactRequest[];
  totalUsers: number;
  totalOrders: number;
};

const adminAmountSchema = z.coerce.number().int().positive();
const signedAmountSchema = z.coerce.number().int().refine((value) => value !== 0, {
  message: "Сумма не должна быть нулевой",
});
const adminOperationSchema = z.enum(["credit", "debit"]).optional();
const topupActionSchema = z.enum(["start_processing", "send_invoice", "mark_paid", "confirm_payment"]);
const contactRequestStatusSchema = z.enum(["new", "in_progress", "processed"]);
const orderStatusSchema = z.enum(["new", "in_discussion", "price_agreed", "in_progress", "completed", "paid", "cancelled"]);
const invoiceTypeSchema = z.enum(["prepayment", "remaining", "full"]);
const editableInvoiceStatusSchema = z.enum(["pending", "sent", "cancelled"]);
/** OTP действует 15 минут (требование: не менее 10 минут). */
const adminPanelPasswordSchema = z.string().min(8, "Пароль должен быть не короче 8 символов").max(128);

function topupStatusResult(
  requestId: number,
  successMessage: string,
  failureMessage: string,
  changes: number,
): Promise<ActionResult> {
  if (changes === 0) {
    return Promise.resolve({ ok: false, message: failureMessage });
  }

  return dbGet<DbTopupRequest>("SELECT status FROM topup_requests WHERE id = ?", [requestId]).then((row) => ({
    ok: true,
    message: successMessage,
    requestStatus: row?.status,
  }));
}

function serviceInvoiceStatusResult(
  requestId: number,
  successMessage: string,
  failureMessage: string,
  changes: number,
): Promise<ActionResult> {
  if (changes === 0) {
    return Promise.resolve({ ok: false, message: failureMessage });
  }

  return dbGet<DbServiceInvoiceRequest>("SELECT status FROM service_invoice_requests WHERE id = ?", [requestId]).then(
    (row) => ({
      ok: true,
      message: successMessage,
      requestStatus: row?.status,
    }),
  );
}

async function requireAdmin() {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return null;
  if (!(await hasAdminPanelAccess(admin.id))) return null;
  return admin;
}

async function applyOrderPayment(
  tx: Parameters<typeof dbTxRun>[0],
  order: DbOrder,
  amount: number,
  invoiceId: number | null,
  adminId: number,
) {
  if (invoiceId) {
    await dbTxRun(tx, "UPDATE invoices SET status = 'paid' WHERE id = ? AND status != 'paid'", [invoiceId]);
  }

  await dbTxRun(
    tx,
    `INSERT INTO payments (order_id, invoice_id, amount, confirmed_by)
     VALUES (?, ?, ?, ?)`,
    [order.id, invoiceId, amount, adminId],
  );

  const nextPaidAmount = order.paid_amount + amount;
  const nextStatus = order.total_amount > 0 && nextPaidAmount >= order.total_amount ? "paid" : order.status;

  await dbTxRun(
    tx,
    `UPDATE orders
     SET paid_amount = ?,
         status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [nextPaidAmount, nextStatus, order.id],
  );
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

  revalidatePath("/account");
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
  if (!verifyPassword(password.data, storedHash)) return { ok: false, message: "Неверный пароль админ-панели" };

  await createAdminPanelSession(admin.id);

  revalidatePath("/account");
  revalidatePath("/admin");
  return { ok: true, message: "Доступ к админ-панели открыт на 24 часа." };
}

export async function revokeAdminPanelAccessAction() {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return { ok: false, message: "Недостаточно прав" } satisfies ActionResult;

  await destroyAdminPanelSession();

  revalidatePath("/account");
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
  revalidatePath("/account");
  revalidatePath("/admin");
}

export async function requestBalanceTopupAction(_formData: FormData): Promise<ActionResult> {
  void _formData;
  return { ok: false, message: "Личный кабинет и пополнение баланса больше не используются." };
}

export async function adminUpdateTopupRequestAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const requestId = z.coerce.number().int().positive().safeParse(formData.get("requestId"));
  const action = topupActionSchema.safeParse(formData.get("action"));
  const invoiceAmount = adminAmountSchema.safeParse(formData.get("invoiceAmount"));
  const adminComment = z.string().max(500).optional().safeParse(formData.get("adminComment")?.toString() || undefined);

  if (!requestId.success || !action.success || !adminComment.success) {
    return { ok: false, message: "Проверьте заявку и действие" };
  }

  const request = await dbGet<DbTopupRequest>("SELECT * FROM topup_requests WHERE id = ?", [requestId.data]);

  if (!request) return { ok: false, message: "Заявка не найдена" };
  if (request.status === "completed") return { ok: false, message: "Заявка уже завершена" };

  if (action.data === "start_processing") {
    // pending → processing: админ берёт заявку в работу.
    const update = await dbRun(
      `UPDATE topup_requests
       SET status = 'processing', processed_by_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [admin.email, request.id],
    );

    revalidatePath("/admin");
    revalidatePath("/account");
    return topupStatusResult(
      request.id,
      "Заявка взята в работу",
      "Не удалось взять заявку в работу. Обновите страницу и проверьте статус.",
      update.changes,
    );
  }

  if (action.data === "send_invoice") {
    if (!invoiceAmount.success) return { ok: false, message: "Введите сумму счёта больше 0 ₽" };

    const update = await dbRun(
      `UPDATE topup_requests
       SET status = 'invoice_sent',
           invoice_amount = ?,
           admin_comment = ?,
           processed_by_email = ?,
           invoice_sent_at = COALESCE(invoice_sent_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('pending', 'processing', 'invoice_sent')`,
      [invoiceAmount.data, adminComment.data ?? null, admin.email, request.id],
    );

    revalidatePath("/admin");
    revalidatePath("/account");
    return topupStatusResult(
      request.id,
      "Счёт отмечен как отправленный",
      "Не удалось обновить заявку. Проверьте текущий статус.",
      update.changes,
    );
  }

  if (action.data === "mark_paid") {
    const update = await dbRun(
      `UPDATE topup_requests
       SET status = 'paid',
           admin_comment = COALESCE(?, admin_comment),
           processed_by_email = ?,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'invoice_sent'`,
      [adminComment.data ?? null, admin.email, request.id],
    );

    revalidatePath("/admin");
    revalidatePath("/account");
    return topupStatusResult(
      request.id,
      "Оплата отмечена как полученная. Теперь можно зачислить баланс.",
      "Не удалось отметить оплату. Заявка должна быть в статусе «Счёт отправлен».",
      update.changes,
    );
  }

  if (request.status !== "paid") {
    return { ok: false, message: "Сначала отметьте заявку как оплаченную" };
  }

  const amountToCredit = request.invoice_amount ?? request.requested_amount;

  await dbTransaction(async (tx) => {
    const freshRequest = await dbTxGet<DbTopupRequest>(tx, "SELECT * FROM topup_requests WHERE id = ?", [request.id]);

    if (!freshRequest || freshRequest.status !== "paid") return;

    const amount = freshRequest.invoice_amount ?? freshRequest.requested_amount;

    await dbTxRun(
      tx,
      `UPDATE topup_requests
       SET status = 'completed',
           processed_by_email = ?,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [admin.email, freshRequest.id],
    );

    await dbTxRun(tx, "UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      amount,
      freshRequest.user_id,
    ]);

    await dbTxRun(
      tx,
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, ?, 'admin_adjustment', ?)`,
      [freshRequest.user_id, amount, `Пополнение по заявке #${freshRequest.id}. Подтвердил: ${admin.email}`],
    );
  });

  revalidatePath("/admin");
  revalidatePath("/account");
  return {
    ok: true,
    message: `Оплата подтверждена, баланс пополнен на ${amountToCredit.toLocaleString("ru-RU")} ₽`,
    requestStatus: "completed",
  };
}

export async function requestServiceInvoicePaymentAction(_slug: string): Promise<ActionResult> {
  void _slug;
  return { ok: false, message: "Оформление заказа на сайте больше не используется. Свяжитесь с нами для обсуждения услуги." };
}

export async function adminUpdateServiceInvoiceRequestAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const requestId = z.coerce.number().int().positive().safeParse(formData.get("requestId"));
  const action = topupActionSchema.safeParse(formData.get("action"));
  const invoiceAmount = adminAmountSchema.safeParse(formData.get("invoiceAmount"));
  const adminComment = z.string().max(500).optional().safeParse(formData.get("adminComment")?.toString() || undefined);

  if (!requestId.success || !action.success || !adminComment.success) {
    return { ok: false, message: "Проверьте заявку и действие" };
  }

  const request = await dbGet<DbServiceInvoiceRequest>("SELECT * FROM service_invoice_requests WHERE id = ?", [
    requestId.data,
  ]);

  if (!request) return { ok: false, message: "Заявка не найдена" };
  if (request.status === "completed") return { ok: false, message: "Заявка уже завершена" };

  if (action.data === "start_processing") {
    // pending → processing для оплаты услуги по счёту.
    const update = await dbRun(
      `UPDATE service_invoice_requests
       SET status = 'processing', processed_by_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [admin.email, request.id],
    );

    revalidatePath("/admin");
    revalidatePath("/account");
    return serviceInvoiceStatusResult(
      request.id,
      "Заявка на оплату по счёту взята в работу",
      "Не удалось взять заявку в работу. Обновите страницу и проверьте статус.",
      update.changes,
    );
  }

  if (action.data === "send_invoice") {
    if (!invoiceAmount.success) return { ok: false, message: "Введите сумму счёта больше 0 ₽" };

    const update = await dbTransaction(async (tx) => {
      const statusUpdate = await dbTxRun(
        tx,
        `UPDATE service_invoice_requests
         SET status = 'invoice_sent',
             invoice_amount = ?,
             admin_comment = ?,
             processed_by_email = ?,
             invoice_sent_at = COALESCE(invoice_sent_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('pending', 'processing', 'invoice_sent')`,
        [invoiceAmount.data, adminComment.data ?? null, admin.email, request.id],
      );

      if (statusUpdate.changes === 0) return 0;

      await dbTxRun(tx, "UPDATE orders SET amount = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
        invoiceAmount.data,
        invoiceAmount.data,
        request.order_id,
      ]);
      return statusUpdate.changes;
    });

    revalidatePath("/admin");
    revalidatePath("/account");
    return serviceInvoiceStatusResult(
      request.id,
      "Счёт по услуге отмечен как отправленный",
      "Не удалось обновить заявку. Проверьте текущий статус.",
      update,
    );
  }

  if (action.data === "mark_paid") {
    const update = await dbRun(
      `UPDATE service_invoice_requests
       SET status = 'paid',
           admin_comment = COALESCE(?, admin_comment),
           processed_by_email = ?,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'invoice_sent'`,
      [adminComment.data ?? null, admin.email, request.id],
    );

    revalidatePath("/admin");
    revalidatePath("/account");
    return serviceInvoiceStatusResult(
      request.id,
      "Оплата по счёту отмечена как полученная",
      "Не удалось отметить оплату. Заявка должна быть в статусе «Счёт отправлен».",
      update.changes,
    );
  }

  if (request.status !== "paid") {
    return { ok: false, message: "Сначала отметьте заявку как оплаченную" };
  }

  await dbTransaction(async (tx) => {
    const freshRequest = await dbTxGet<DbServiceInvoiceRequest>(tx, "SELECT * FROM service_invoice_requests WHERE id = ?", [
      request.id,
    ]);

    if (!freshRequest || freshRequest.status !== "paid") return;

    const paidAmount = freshRequest.invoice_amount ?? freshRequest.requested_amount;

    await dbTxRun(
      tx,
      `UPDATE service_invoice_requests
       SET status = 'completed',
           processed_by_email = ?,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [admin.email, freshRequest.id],
    );

    const order = await dbTxGet<DbOrder>(tx, "SELECT * FROM orders WHERE id = ?", [freshRequest.order_id]);
    if (order) {
      await applyOrderPayment(tx, { ...order, total_amount: paidAmount }, paidAmount, null, admin.id);
      await dbTxRun(tx, "UPDATE orders SET amount = ?, total_amount = ?, status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
        paidAmount,
        paidAmount,
        freshRequest.order_id,
      ]);
    }

    await dbTxRun(
      tx,
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, 0, 'invoice_payment', ?)`,
      [
        freshRequest.user_id,
        `Оплата по счёту подтверждена по заказу #${freshRequest.order_id} на ${paidAmount.toLocaleString("ru-RU")} ₽. Подтвердил: ${admin.email}`,
      ],
    );
  });

  revalidatePath("/admin");
  revalidatePath("/account");
  return {
    ok: true,
    message: "Оплата подтверждена, заказ переведён в статус paid",
    requestStatus: "completed",
  };
}

export async function adminUpdateOrderAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const orderId = z.coerce.number().int().positive().safeParse(formData.get("orderId"));
  const totalAmount = z.coerce.number().int().min(0).safeParse(formData.get("totalAmount"));
  const status = orderStatusSchema.safeParse(formData.get("status"));
  const description = z.string().trim().max(1200).safeParse(formData.get("description")?.toString() ?? "");

  if (!orderId.success || !totalAmount.success || !status.success || !description.success) {
    return { ok: false, message: "Проверьте сумму, статус и описание заказа" };
  }

  const order = await dbGet<DbOrder>("SELECT * FROM orders WHERE id = ?", [orderId.data]);
  if (!order) return { ok: false, message: "Заказ не найден" };

  const nextStatus =
    status.data !== "cancelled" && totalAmount.data > 0 && order.paid_amount >= totalAmount.data
      ? "paid"
      : status.data;

  await dbRun(
    `UPDATE orders
     SET total_amount = ?,
         amount = ?,
         description = ?,
         status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [totalAmount.data, totalAmount.data, description.data, nextStatus, order.id],
  );
  const updatedOrder = await dbGet<DbOrder>("SELECT * FROM orders WHERE id = ?", [order.id]);

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true, message: "Заказ обновлён", order: updatedOrder };
}

export async function adminCreateInvoiceAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const orderId = z.coerce.number().int().positive().safeParse(formData.get("orderId"));
  const amount = adminAmountSchema.safeParse(formData.get("amount"));
  const type = invoiceTypeSchema.safeParse(formData.get("type"));

  if (!orderId.success || !amount.success || !type.success) {
    return { ok: false, message: "Проверьте заказ, сумму и тип счёта" };
  }

  const order = await dbGet<DbOrder>("SELECT * FROM orders WHERE id = ?", [orderId.data]);
  if (!order) return { ok: false, message: "Заказ не найден" };
  if (order.status === "cancelled") return { ok: false, message: "Нельзя выставить счёт по отменённому заказу" };

  const inserted = await dbRun(
    `INSERT INTO invoices (order_id, amount, type, status)
     VALUES (?, ?, ?, 'pending')`,
    [order.id, amount.data, type.data],
  );
  const invoice = await dbGet<DbInvoice>("SELECT * FROM invoices WHERE id = ?", [inserted.lastInsertRowid]);

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true, message: "Счёт создан", invoice };
}

export async function adminUpdateInvoiceStatusAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const invoiceId = z.coerce.number().int().positive().safeParse(formData.get("invoiceId"));
  const status = editableInvoiceStatusSchema.safeParse(formData.get("status"));

  if (!invoiceId.success || !status.success) {
    return { ok: false, message: "Проверьте счёт и статус" };
  }

  const invoice = await dbGet<DbInvoice>("SELECT * FROM invoices WHERE id = ?", [invoiceId.data]);
  if (!invoice) return { ok: false, message: "Счёт не найден" };
  if (invoice.status === "paid") return { ok: false, message: "Оплаченный счёт нельзя изменить" };
  if (invoice.status === "cancelled") return { ok: false, message: "Отменённый счёт нельзя изменить" };

  await dbRun("UPDATE invoices SET status = ? WHERE id = ?", [status.data, invoice.id]);
  const updatedInvoice = await dbGet<DbInvoice>("SELECT * FROM invoices WHERE id = ?", [invoice.id]);

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true, message: "Статус счёта обновлён", invoice: updatedInvoice };
}

export async function adminConfirmInvoicePaymentAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const invoiceId = z.coerce.number().int().positive().safeParse(formData.get("invoiceId"));
  if (!invoiceId.success) return { ok: false, message: "Проверьте счёт" };

  const result = await dbTransaction(async (tx) => {
    const invoice = await dbTxGet<DbInvoice>(tx, "SELECT * FROM invoices WHERE id = ?", [invoiceId.data]);
    if (!invoice) return { ok: false, message: "Счёт не найден" };
    if (invoice.status === "paid") return { ok: false, message: "Счёт уже оплачен" };
    if (invoice.status === "cancelled") return { ok: false, message: "Отменённый счёт нельзя оплатить" };

    const order = await dbTxGet<DbOrder>(tx, "SELECT * FROM orders WHERE id = ?", [invoice.order_id]);
    if (!order) return { ok: false, message: "Заказ не найден" };

    await applyOrderPayment(tx, order, invoice.amount, invoice.id, admin.id);
    const updatedInvoice = await dbTxGet<DbInvoice>(tx, "SELECT * FROM invoices WHERE id = ?", [invoice.id]);
    const updatedOrder = await dbTxGet<DbOrder>(tx, "SELECT * FROM orders WHERE id = ?", [order.id]);
    const payment = await dbTxGet<DbPayment>(
      tx,
      "SELECT * FROM payments WHERE order_id = ? AND invoice_id = ? ORDER BY id DESC LIMIT 1",
      [order.id, invoice.id],
    );
    return {
      ok: true,
      message: "Оплата счёта подтверждена",
      invoice: updatedInvoice,
      order: updatedOrder,
      payment,
    };
  });

  revalidatePath("/admin");
  revalidatePath("/account");
  return result;
}

export async function adminCreateManualPaymentAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const orderId = z.coerce.number().int().positive().safeParse(formData.get("orderId"));
  const amount = adminAmountSchema.safeParse(formData.get("amount"));

  if (!orderId.success || !amount.success) {
    return { ok: false, message: "Проверьте заказ и сумму оплаты" };
  }

  const result = await dbTransaction(async (tx) => {
    const order = await dbTxGet<DbOrder>(tx, "SELECT * FROM orders WHERE id = ?", [orderId.data]);
    if (!order) return { ok: false, message: "Заказ не найден" };
    if (order.status === "cancelled") return { ok: false, message: "Нельзя оплатить отменённый заказ" };

    await applyOrderPayment(tx, order, amount.data, null, admin.id);
    const updatedOrder = await dbTxGet<DbOrder>(tx, "SELECT * FROM orders WHERE id = ?", [order.id]);
    const payment = await dbTxGet<DbPayment>(
      tx,
      "SELECT * FROM payments WHERE order_id = ? AND invoice_id IS NULL ORDER BY id DESC LIMIT 1",
      [order.id],
    );
    return { ok: true, message: "Оплата добавлена к заказу", order: updatedOrder, payment };
  });

  revalidatePath("/admin");
  revalidatePath("/account");
  return result;
}

export async function adminAdjustBalanceAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const userId = z.coerce.number().int().positive().safeParse(formData.get("userId"));
  const operation = adminOperationSchema.safeParse(formData.get("operation"));
  const amount = operation.success && operation.data
    ? adminAmountSchema.safeParse(formData.get("amount"))
    : signedAmountSchema.safeParse(formData.get("amount"));
  const reason = z.string().max(200).optional().parse(formData.get("reason")?.toString() || undefined);

  if (!userId.success || !amount.success) {
    return { ok: false, message: "Проверьте пользователя и сумму" };
  }

  const signedAmount = operation.success && operation.data === "debit" ? -amount.data : amount.data;

  const user = await dbGet<DbUser>("SELECT * FROM users WHERE id = ?", [userId.data]);
  if (!user) return { ok: false, message: "Пользователь не найден" };
  if (user.balance + signedAmount < 0) return { ok: false, message: "Баланс не может уйти ниже нуля" };

  await dbTransaction(async (tx) => {
    await dbTxRun(tx, "UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      signedAmount,
      user.id,
    ]);
    await dbTxRun(
      tx,
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, ?, 'admin_adjustment', ?)`,
      [user.id, signedAmount, reason || `Корректировка администратором ${admin.email}`],
    );
  });

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true, message: "Баланс пользователя обновлен" };
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

export async function deleteUserAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const userId = z.coerce.number().int().positive().safeParse(formData.get("userId"));
  const confirmation = z.string().safeParse(formData.get("confirmation"));
  if (!userId.success || !confirmation.success || confirmation.data !== "DELETE") {
    return { ok: false, message: "Для удаления введите DELETE" };
  }

  if (userId.data === admin.id) {
    return { ok: false, message: "Нельзя удалить текущего администратора" };
  }

  const result = await dbRun("DELETE FROM users WHERE id = ?", [userId.data]);
  revalidatePath("/admin");
  return result.changes ? { ok: true, message: "Пользователь удален" } : { ok: false, message: "Пользователь не найден" };
}

export async function getAccountSnapshot(userId: number) {
  const user = await getCurrentUser();
  const canReadAccount =
    user?.id === userId || (user?.role === "admin" && (await hasAdminPanelAccess(user.id)));

  if (!canReadAccount) {
    throw new Error("Unauthorized");
  }

  // Три независимых запроса выполняем параллельно — экономим два сетевых раундтрипа к БД.
  const [orders, invoices, serviceInvoiceRequests] = await Promise.all([
    dbAll<DbOrder>("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [userId]),
    dbAll<DbInvoice>(
      `SELECT invoices.*
       FROM invoices
       JOIN orders ON orders.id = invoices.order_id
       WHERE orders.user_id = ?
       ORDER BY invoices.created_at DESC`,
      [userId],
    ),
    dbAll<DbServiceInvoiceRequest>(
      "SELECT * FROM service_invoice_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
      [userId],
    ),
  ]);
  return { orders, invoices, serviceInvoiceRequests };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  const admin = await requireAdmin();
  if (!admin) {
    throw new Error("Unauthorized");
  }

  const users = await dbAll<AdminUserRow>(
    `SELECT
      users.id,
      users.email,
      users.role,
      users.balance,
      users.created_at,
      users.updated_at,
      (SELECT MAX(created_at) FROM transactions WHERE transactions.user_id = users.id AND transactions.amount > 0) AS last_topup_at,
      MAX(
        users.updated_at,
        COALESCE((SELECT MAX(created_at) FROM orders WHERE orders.user_id = users.id), users.updated_at),
        COALESCE((SELECT MAX(created_at) FROM transactions WHERE transactions.user_id = users.id), users.updated_at),
        COALESCE((SELECT MAX(created_at) FROM topup_requests WHERE topup_requests.user_id = users.id), users.updated_at)
      ) AS last_activity_at,
      (SELECT title FROM orders WHERE orders.user_id = users.id ORDER BY created_at DESC LIMIT 1) AS last_order_title,
      (SELECT MAX(created_at) FROM orders WHERE orders.user_id = users.id) AS last_order_at,
      (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id) AS total_orders,
      (SELECT COALESCE(SUM(paid_amount), 0) FROM orders WHERE orders.user_id = users.id) AS total_spent
     FROM users
     ORDER BY users.created_at DESC`,
  );

  const orders = await dbAll<DbOrder>("SELECT * FROM orders ORDER BY created_at DESC");
  const invoices = await dbAll<DbInvoice>("SELECT * FROM invoices ORDER BY created_at DESC");
  const payments = await dbAll<DbPayment>("SELECT * FROM payments ORDER BY created_at DESC");
  const serviceInvoiceRequests = await dbAll<DbServiceInvoiceRequest & { email: string }>(
    `SELECT service_invoice_requests.*, users.email
     FROM service_invoice_requests
     JOIN users ON users.id = service_invoice_requests.user_id
     ORDER BY
      CASE service_invoice_requests.status
        WHEN 'pending' THEN 0
        WHEN 'processing' THEN 1
        WHEN 'invoice_sent' THEN 2
        WHEN 'paid' THEN 3
        WHEN 'completed' THEN 4
        ELSE 5
      END,
      service_invoice_requests.created_at DESC`,
  );

  const contactRequests = await dbAll<DbContactRequest>(
    "SELECT * FROM contact_requests ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, created_at DESC",
  );

  const totals = await dbGet<{
    totalUsers: number;
    totalOrders: number;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COUNT(*) FROM orders) AS totalOrders`,
  );

  return {
    users,
    orders,
    invoices,
    payments,
    serviceInvoiceRequests,
    contactRequests,
    totalUsers: totals?.totalUsers ?? 0,
    totalOrders: totals?.totalOrders ?? 0,
  };
}
