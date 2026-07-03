"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, destroySession, getCurrentUser, hashOtp } from "@/lib/auth";
import {
  db,
  type DbContactRequest,
  type DbOrder,
  type DbServiceInvoiceRequest,
  type DbTopupRequest,
  type DbTransaction,
  type DbUser,
  upsertUserByEmail,
} from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";
import { getServiceBySlug } from "@/lib/services";

export type ActionResult = {
  ok: boolean;
  message: string;
  code?: string;
};

export type AdminUserRow = DbUser & {
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
  transactions: DbTransaction[];
  topupRequests: Array<DbTopupRequest & { email: string }>;
  serviceInvoiceRequests: Array<DbServiceInvoiceRequest & { email: string }>;
  contactRequests: DbContactRequest[];
  totalUsers: number;
  totalBalance: number;
  totalOrders: number;
};

const emailSchema = z.string().email("Введите корректный email").toLowerCase();
const amountSchema = z.coerce.number().int().positive();
const adminAmountSchema = z.coerce.number().int().positive();
const signedAmountSchema = z.coerce.number().int().refine((value) => value !== 0, {
  message: "Сумма не должна быть нулевой",
});
const adminOperationSchema = z.enum(["credit", "debit"]).optional();
const topupActionSchema = z.enum(["start_processing", "send_invoice", "mark_paid", "confirm_payment"]);
const contactRequestStatusSchema = z.enum(["new", "in_progress", "processed"]);
const otpTtlMinutes = 15;
const otpCooldownSeconds = 60;
const otpHourlyLimit = 5;

function randomOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function requireAdmin() {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return null;
  return admin;
}

export async function requestOtpAction(formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Неверный email" };
  }

  const email = parsed.data;
  const recent = db
    .prepare(
      `SELECT
        COUNT(*) AS hourly_count,
        MAX(created_at) AS last_created_at
       FROM otp_codes
       WHERE email = ? AND created_at >= datetime('now', '-1 hour')`,
    )
    .get(email) as { hourly_count: number; last_created_at: string | null };

  if (recent.last_created_at) {
    const lastCreatedAt = new Date(`${recent.last_created_at.replace(" ", "T")}Z`).getTime();
    const secondsSinceLastCode = Math.floor((Date.now() - lastCreatedAt) / 1000);
    if (secondsSinceLastCode < otpCooldownSeconds) {
      return {
        ok: false,
        message: `Повторный код можно запросить через ${otpCooldownSeconds - secondsSinceLastCode} сек.`,
      };
    }
  }

  if (recent.hourly_count >= otpHourlyLimit) {
    return { ok: false, message: "Слишком много запросов кода. Попробуйте позже." };
  }

  const code = randomOtp();
  const expiresInMinutes = otpTtlMinutes;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  const insertedCode = db.prepare(
    `INSERT INTO otp_codes (email, code_hash, expires_at)
     VALUES (?, ?, ?)`,
  ).run(email, hashOtp(email, code), expiresAt);

  try {
    const delivery = await sendOtpEmail({ email, code, expiresInMinutes });

    return {
      ok: true,
      message: delivery.delivered
        ? `Код отправлен на ${email}. Он действует ${expiresInMinutes} минут.`
        : `Dev OTP: ${code}. Resend не настроен, код также выведен в консоль сервера.`,
      code: delivery.demoCode,
    };
  } catch (error) {
    db.prepare("UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?").run(insertedCode.lastInsertRowid);
    console.error("[SKM OTP] Resend delivery failed", error);
    const deliveryError = error instanceof Error ? error.message : "";
    if (deliveryError.includes("You can only send testing emails") || deliveryError.includes("verify a domain")) {
      return {
        ok: false,
        message: "Resend сейчас в тестовом режиме: письма можно отправлять только на email владельца аккаунта. Для остальных адресов подтвердите домен в Resend и задайте OTP_FROM_EMAIL.",
      };
    }

    if (deliveryError.toLowerCase().includes("api key")) {
      return { ok: false, message: "Resend отклонил API key. Проверьте RESEND_API_KEY в .env.local и перезапустите сервер." };
    }

    return { ok: false, message: "Не удалось отправить код на email. Проверьте настройки Resend." };
  }
}

export async function createContactRequestAction(formData: FormData): Promise<ActionResult> {
  const name = z.string().trim().max(120).optional().safeParse(formData.get("name")?.toString() || undefined);
  const phone = z.string().trim().min(5, "Укажите номер телефона").max(40).safeParse(formData.get("phone"));
  const comment = z.string().trim().min(5, "Опишите задачу").max(1200).safeParse(formData.get("comment"));

  if (!name.success || !phone.success || !comment.success) {
    return { ok: false, message: phone.error?.issues[0]?.message ?? comment.error?.issues[0]?.message ?? "Проверьте данные заявки" };
  }

  db.prepare(
    `INSERT INTO contact_requests (name, phone, comment)
     VALUES (?, ?, ?)`,
  ).run(name.data ?? null, phone.data, comment.data);

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, message: "Заявка отправлена. Мы свяжемся с вами в ближайшее время." };
}

export async function verifyOtpAction(formData: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = z.string().regex(/^\d{6}$/, "Введите 6 цифр").safeParse(formData.get("code"));

  if (!email.success || !code.success) {
    return { ok: false, message: "Проверьте email и 6-значный код" };
  }

  const row = db
    .prepare(
      `SELECT id, code_hash, expires_at
       FROM otp_codes
       WHERE email = ? AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(email.data) as { id: number; code_hash: string; expires_at: string } | undefined;

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, message: "Код истек. Запросите новый." };
  }

  if (row.code_hash !== hashOtp(email.data, code.data)) {
    return { ok: false, message: "Неверный код" };
  }

  db.prepare("UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
  const user = upsertUserByEmail(email.data);
  await createSession(user);

  revalidatePath("/account");
  revalidatePath("/admin");
  return { ok: true, message: "Вход выполнен" };
}

export async function logoutAction() {
  await destroySession();
  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath("/admin");
}

export async function requestBalanceTopupAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Войдите, чтобы запросить пополнение баланса" };

  const parsed = amountSchema.safeParse(formData.get("amount"));
  if (!parsed.success) return { ok: false, message: "Введите сумму пополнения больше 0 ₽" };

  const amount = parsed.data;
  const comment = z.string().max(300).optional().safeParse(formData.get("comment")?.toString() || undefined);
  if (!comment.success) return { ok: false, message: "Комментарий должен быть короче 300 символов" };

  db.prepare(
    `INSERT INTO topup_requests (user_id, requested_amount, user_comment)
     VALUES (?, ?, ?)`,
  ).run(user.id, amount, comment.data ?? null);

  revalidatePath("/account");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Заявка на пополнение ${amount.toLocaleString("ru-RU")} ₽ создана со статусом pending. Менеджер подготовит счёт.`,
  };
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

  const request = db
    .prepare("SELECT * FROM topup_requests WHERE id = ?")
    .get(requestId.data) as DbTopupRequest | undefined;

  if (!request) return { ok: false, message: "Заявка не найдена" };
  if (request.status === "completed") return { ok: false, message: "Заявка уже завершена" };

  if (action.data === "start_processing") {
    db.prepare(
      `UPDATE topup_requests
       SET status = 'processing', processed_by_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
    ).run(admin.email, request.id);

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Заявка взята в работу" };
  }

  if (action.data === "send_invoice") {
    if (!invoiceAmount.success) return { ok: false, message: "Введите сумму счёта больше 0 ₽" };

    db.prepare(
      `UPDATE topup_requests
       SET status = 'invoice_sent',
           invoice_amount = ?,
           admin_comment = ?,
           processed_by_email = ?,
           invoice_sent_at = COALESCE(invoice_sent_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('pending', 'processing', 'invoice_sent')`,
    ).run(invoiceAmount.data, adminComment.data ?? null, admin.email, request.id);

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Счёт отмечен как отправленный" };
  }

  if (action.data === "mark_paid") {
    db.prepare(
      `UPDATE topup_requests
       SET status = 'paid',
           admin_comment = COALESCE(?, admin_comment),
           processed_by_email = ?,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'invoice_sent'`,
    ).run(adminComment.data ?? null, admin.email, request.id);

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Оплата отмечена как полученная. Теперь можно зачислить баланс." };
  }

  if (request.status !== "paid") {
    return { ok: false, message: "Сначала отметьте заявку как оплаченную" };
  }

  const amountToCredit = request.invoice_amount ?? request.requested_amount;

  db.transaction(() => {
    const freshRequest = db
      .prepare("SELECT * FROM topup_requests WHERE id = ?")
      .get(request.id) as DbTopupRequest | undefined;

    if (!freshRequest || freshRequest.status !== "paid") return;

    const amount = freshRequest.invoice_amount ?? freshRequest.requested_amount;

    db.prepare(
      `UPDATE topup_requests
       SET status = 'completed',
           processed_by_email = ?,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(admin.email, freshRequest.id);

    db.prepare("UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amount, freshRequest.user_id);

    db.prepare(
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, ?, 'admin_adjustment', ?)`,
    ).run(freshRequest.user_id, amount, `Пополнение по заявке #${freshRequest.id}. Подтвердил: ${admin.email}`);
  })();

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true, message: `Оплата подтверждена, баланс пополнен на ${amountToCredit.toLocaleString("ru-RU")} ₽` };
}

export async function checkoutFromBalanceAction(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const service = getServiceBySlug(slug);

  if (!user) return { ok: false, message: "Войдите, чтобы оплатить услугу" };
  if (!service) return { ok: false, message: "Услуга не найдена" };

  const complete = db.transaction(() => {
    const freshUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as DbUser;
    if (freshUser.balance < service.price) {
      return { ok: false, message: "Недостаточно средств на балансе" };
    }

    const order = db
      .prepare(
        `INSERT INTO orders (user_id, service_slug, service_title, amount, payment_method, status)
         VALUES (?, ?, ?, ?, 'balance', 'paid')`,
      )
      .run(freshUser.id, service.slug, service.title, service.price);

    db.prepare("UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(service.price, freshUser.id);
    db.prepare(
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, ?, 'order_payment', ?)`,
    ).run(freshUser.id, -service.price, `Оплата заказа #${order.lastInsertRowid}: ${service.title}`);

    return { ok: true, message: "Заказ создан и оплачен с баланса" };
  });

  const result = complete();
  revalidatePath("/account");
  revalidatePath("/admin");
  return result;
}

export async function checkoutByCardAction(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const service = getServiceBySlug(slug);

  if (!user) return { ok: false, message: "Войдите, чтобы оформить оплату картой" };
  if (!service) return { ok: false, message: "Услуга не найдена" };

  const order = db
    .prepare(
      `INSERT INTO orders (user_id, service_slug, service_title, amount, payment_method, status)
       VALUES (?, ?, ?, ?, 'card', 'awaiting_payment')`,
    )
    .run(user.id, service.slug, service.title, service.price);

  db.prepare(
    `INSERT INTO transactions (user_id, amount, type, description)
     VALUES (?, ?, 'card_payment_request', ?)`,
  ).run(user.id, 0, `Запрос оплаты картой по заказу #${order.lastInsertRowid}`);

  revalidatePath("/account");
  revalidatePath("/admin");
  return { ok: true, message: "Заказ создан со статусом awaiting_payment. Менеджер свяжется с вами для оплаты." };
}

export async function requestServiceInvoicePaymentAction(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const service = getServiceBySlug(slug);

  if (!user) return { ok: false, message: "Войдите, чтобы запросить оплату по счёту" };
  if (!service) return { ok: false, message: "Услуга не найдена" };

  const orderId = db.transaction(() => {
    const order = db
      .prepare(
        `INSERT INTO orders (user_id, service_slug, service_title, amount, payment_method, status)
         VALUES (?, ?, ?, ?, 'invoice', 'awaiting_payment')`,
      )
      .run(user.id, service.slug, service.title, service.price);

    db.prepare(
      `INSERT INTO service_invoice_requests (user_id, order_id, service_slug, service_title, requested_amount)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(user.id, order.lastInsertRowid, service.slug, service.title, service.price);

    db.prepare(
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, 0, 'invoice_payment', ?)`,
    ).run(user.id, `Запрос оплаты по счёту по заказу #${order.lastInsertRowid}: ${service.title}`);

    return Number(order.lastInsertRowid);
  })();

  revalidatePath("/account");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Заявка на оплату по счёту создана по заказу #${orderId}. Менеджер подготовит счёт и свяжется с вами.`,
  };
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

  const request = db
    .prepare("SELECT * FROM service_invoice_requests WHERE id = ?")
    .get(requestId.data) as DbServiceInvoiceRequest | undefined;

  if (!request) return { ok: false, message: "Заявка не найдена" };
  if (request.status === "completed") return { ok: false, message: "Заявка уже завершена" };

  if (action.data === "start_processing") {
    db.prepare(
      `UPDATE service_invoice_requests
       SET status = 'processing', processed_by_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
    ).run(admin.email, request.id);

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Заявка на оплату по счёту взята в работу" };
  }

  if (action.data === "send_invoice") {
    if (!invoiceAmount.success) return { ok: false, message: "Введите сумму счёта больше 0 ₽" };

    db.transaction(() => {
      db.prepare(
        `UPDATE service_invoice_requests
         SET status = 'invoice_sent',
             invoice_amount = ?,
             admin_comment = ?,
             processed_by_email = ?,
             invoice_sent_at = COALESCE(invoice_sent_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('pending', 'processing', 'invoice_sent')`,
      ).run(invoiceAmount.data, adminComment.data ?? null, admin.email, request.id);

      db.prepare("UPDATE orders SET amount = ? WHERE id = ?").run(invoiceAmount.data, request.order_id);
    })();

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Счёт по услуге отмечен как отправленный" };
  }

  if (action.data === "mark_paid") {
    db.prepare(
      `UPDATE service_invoice_requests
       SET status = 'paid',
           admin_comment = COALESCE(?, admin_comment),
           processed_by_email = ?,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'invoice_sent'`,
    ).run(adminComment.data ?? null, admin.email, request.id);

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Оплата по счёту отмечена как полученная" };
  }

  if (request.status !== "paid") {
    return { ok: false, message: "Сначала отметьте заявку как оплаченную" };
  }

  db.transaction(() => {
    const freshRequest = db
      .prepare("SELECT * FROM service_invoice_requests WHERE id = ?")
      .get(request.id) as DbServiceInvoiceRequest | undefined;

    if (!freshRequest || freshRequest.status !== "paid") return;

    const paidAmount = freshRequest.invoice_amount ?? freshRequest.requested_amount;

    db.prepare(
      `UPDATE service_invoice_requests
       SET status = 'completed',
           processed_by_email = ?,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(admin.email, freshRequest.id);

    db.prepare("UPDATE orders SET status = 'paid', amount = ? WHERE id = ?").run(paidAmount, freshRequest.order_id);

    db.prepare(
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, 0, 'invoice_payment', ?)`,
    ).run(
      freshRequest.user_id,
      `Оплата по счёту подтверждена по заказу #${freshRequest.order_id} на ${paidAmount.toLocaleString("ru-RU")} ₽. Подтвердил: ${admin.email}`,
    );
  })();

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true, message: "Оплата подтверждена, заказ переведён в статус paid" };
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

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId.data) as DbUser | undefined;
  if (!user) return { ok: false, message: "Пользователь не найден" };
  if (user.balance + signedAmount < 0) return { ok: false, message: "Баланс не может уйти ниже нуля" };

  db.transaction(() => {
    db.prepare("UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(signedAmount, user.id);
    db.prepare(
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, ?, 'admin_adjustment', ?)`,
    ).run(user.id, signedAmount, reason || `Корректировка администратором ${admin.email}`);
  })();

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

  const result = db
    .prepare("UPDATE contact_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(status.data, requestId.data);

  revalidatePath("/admin");
  return result.changes ? { ok: true, message: "Статус заявки обновлен" } : { ok: false, message: "Заявка не найдена" };
}

export async function deleteContactRequestAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const requestId = z.coerce.number().int().positive().safeParse(formData.get("requestId"));
  if (!requestId.success) return { ok: false, message: "Проверьте заявку" };

  const result = db.prepare("DELETE FROM contact_requests WHERE id = ?").run(requestId.data);
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

  const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId.data);
  revalidatePath("/admin");
  return result.changes ? { ok: true, message: "Пользователь удален" } : { ok: false, message: "Пользователь не найден" };
}

export async function getAccountSnapshot(userId: number) {
  const orders = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(userId) as DbOrder[];
  const transactions = db
    .prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(userId) as DbTransaction[];
  const topupRequests = db
    .prepare("SELECT * FROM topup_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 10")
    .all(userId) as DbTopupRequest[];
  const serviceInvoiceRequests = db
    .prepare("SELECT * FROM service_invoice_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(userId) as DbServiceInvoiceRequest[];
  return { orders, transactions, topupRequests, serviceInvoiceRequests };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  const users = db
    .prepare(
      `SELECT
        users.*,
        (SELECT MAX(created_at) FROM transactions WHERE transactions.user_id = users.id AND transactions.amount > 0) AS last_topup_at,
        MAX(
          users.updated_at,
          COALESCE((SELECT MAX(created_at) FROM orders WHERE orders.user_id = users.id), users.updated_at),
          COALESCE((SELECT MAX(created_at) FROM transactions WHERE transactions.user_id = users.id), users.updated_at),
          COALESCE((SELECT MAX(created_at) FROM topup_requests WHERE topup_requests.user_id = users.id), users.updated_at)
        ) AS last_activity_at,
        (SELECT service_title FROM orders WHERE orders.user_id = users.id ORDER BY created_at DESC LIMIT 1) AS last_order_title,
        (SELECT MAX(created_at) FROM orders WHERE orders.user_id = users.id) AS last_order_at,
        (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id) AS total_orders,
        (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE orders.user_id = users.id AND status IN ('paid', 'created', 'awaiting_payment')) AS total_spent
       FROM users
       ORDER BY users.created_at DESC`,
    )
    .all() as AdminUserRow[];

  const orders = db
    .prepare("SELECT * FROM orders ORDER BY created_at DESC")
    .all() as DbOrder[];

  const transactions = db
    .prepare("SELECT * FROM transactions ORDER BY created_at DESC")
    .all() as DbTransaction[];

  const topupRequests = db
    .prepare(
      `SELECT topup_requests.*, users.email
       FROM topup_requests
       JOIN users ON users.id = topup_requests.user_id
       ORDER BY
        CASE topup_requests.status
          WHEN 'pending' THEN 0
          WHEN 'processing' THEN 1
          WHEN 'invoice_sent' THEN 2
          WHEN 'paid' THEN 3
          WHEN 'completed' THEN 4
          ELSE 5
        END,
        topup_requests.created_at DESC`,
    )
    .all() as Array<DbTopupRequest & { email: string }>;

  const serviceInvoiceRequests = db
    .prepare(
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
    )
    .all() as Array<DbServiceInvoiceRequest & { email: string }>;

  const contactRequests = db
    .prepare("SELECT * FROM contact_requests ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, created_at DESC")
    .all() as DbContactRequest[];

  const totals = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COALESCE(SUM(balance), 0) FROM users) AS totalBalance,
        (SELECT COUNT(*) FROM orders) AS totalOrders`,
    )
    .get() as {
    totalUsers: number;
    totalBalance: number;
    totalOrders: number;
  };

  return { users, orders, transactions, topupRequests, serviceInvoiceRequests, contactRequests, ...totals };
}
