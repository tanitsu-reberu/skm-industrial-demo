"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createAdminPanelSession,
  createSession,
  destroyAdminPanelSession,
  destroySession,
  getCurrentUser,
  hasAdminPanelAccess,
  hashOtp,
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
  type DbContactRequest,
  type DbOrder,
  type DbServiceInvoiceRequest,
  type DbTopupRequest,
  type DbTransaction,
  type DbUser,
  upsertUserByEmail,
} from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
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
/** OTP действует 15 минут (требование: не менее 10 минут). */
const otpTtlMinutes = 15;
const otpCooldownSeconds = 60;
const otpHourlyLimit = 5;
const adminPanelPasswordSchema = z.string().min(8, "Пароль должен быть не короче 8 символов").max(128);

function randomOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

  return {
    isAdmin: true,
    hasPassword: await hasAdminPanelPassword(user.id),
    hasAccess: await hasAdminPanelAccess(user.id),
  };
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

  await setAdminPanelPassword(admin.id, hashPassword(password.data));
  await createAdminPanelSession(admin.id);

  revalidatePath("/account");
  revalidatePath("/admin");
  return { ok: true, message: "Пароль установлен. Доступ к админ-панели открыт." };
}

export async function verifyAdminPanelPasswordAction(formData: FormData): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return { ok: false, message: "Недостаточно прав" };

  const password = z.string().min(1, "Введите пароль").safeParse(formData.get("password"));
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

export async function requestOtpAction(formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Неверный email" };
  }

  const email = parsed.data;
  const recent = await dbGet<{ hourly_count: number; last_created_at: string | null }>(
    `SELECT
      COUNT(*) AS hourly_count,
      MAX(created_at) AS last_created_at
     FROM otp_codes
     WHERE email = ? AND created_at >= datetime('now', '-1 hour')`,
    [email],
  );

  if (recent?.last_created_at) {
    const lastCreatedAt = new Date(`${recent.last_created_at.replace(" ", "T")}Z`).getTime();
    const secondsSinceLastCode = Math.floor((Date.now() - lastCreatedAt) / 1000);
    if (secondsSinceLastCode < otpCooldownSeconds) {
      return {
        ok: false,
        message: `Повторный код можно запросить через ${otpCooldownSeconds - secondsSinceLastCode} сек.`,
      };
    }
  }

  if ((recent?.hourly_count ?? 0) >= otpHourlyLimit) {
    return { ok: false, message: "Слишком много запросов кода. Попробуйте позже." };
  }

  const code = randomOtp();
  const expiresInMinutes = otpTtlMinutes;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  const insertedCode = await dbRun(
    `INSERT INTO otp_codes (email, code_hash, expires_at)
     VALUES (?, ?, ?)`,
    [email, hashOtp(email, code), expiresAt],
  );

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
    await dbRun("UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?", [insertedCode.lastInsertRowid]);
    console.error("[SKM OTP] Resend delivery failed", error);
    const deliveryError = error instanceof Error ? error.message : "";

    if (
      deliveryError.includes("domain is not verified") ||
      deliveryError.includes("verify a domain") ||
      deliveryError.includes("verify your domain")
    ) {
      return {
        ok: false,
        message:
          "Домен service-skm.ru ещё не подтверждён в Resend. Добавьте DNS-записи SPF и DKIM, затем повторите запрос кода.",
      };
    }

    if (deliveryError.includes("You can only send testing emails")) {
      return {
        ok: false,
        message:
          "Resend в тестовом режиме: письма можно отправлять только на email владельца аккаунта Resend. Подтвердите домен service-skm.ru для отправки на любые адреса.",
      };
    }

    if (deliveryError.toLowerCase().includes("api key")) {
      return {
        ok: false,
        message: "Resend отклонил API key. Проверьте RESEND_API_KEY в Vercel и перезапустите деплой.",
      };
    }

    return {
      ok: false,
      message: "Не удалось отправить код на email. Попробуйте позже или проверьте правильность адреса.",
    };
  }
}

export async function createContactRequestAction(formData: FormData): Promise<ActionResult> {
  const name = z.string().trim().max(120).optional().safeParse(formData.get("name")?.toString() || undefined);
  const phone = z.string().trim().min(5, "Укажите номер телефона").max(40).safeParse(formData.get("phone"));
  const comment = z.string().trim().min(5, "Опишите задачу").max(1200).safeParse(formData.get("comment"));

  if (!name.success || !phone.success || !comment.success) {
    return { ok: false, message: phone.error?.issues[0]?.message ?? comment.error?.issues[0]?.message ?? "Проверьте данные заявки" };
  }

  await dbRun(
    `INSERT INTO contact_requests (name, phone, comment)
     VALUES (?, ?, ?)`,
    [name.data ?? null, phone.data, comment.data],
  );

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

  const row = await dbGet<{ id: number; code_hash: string; expires_at: string }>(
    `SELECT id, code_hash, expires_at
     FROM otp_codes
     WHERE email = ? AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [email.data],
  );

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, message: "Код истек. Запросите новый." };
  }

  if (row.code_hash !== hashOtp(email.data, code.data)) {
    return { ok: false, message: "Неверный код" };
  }

  await dbRun("UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?", [row.id]);
  const user = await upsertUserByEmail(email.data);
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

  await dbRun(
    `INSERT INTO topup_requests (user_id, requested_amount, user_comment)
     VALUES (?, ?, ?)`,
    [user.id, amount, comment.data ?? null],
  );

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

  const request = await dbGet<DbTopupRequest>("SELECT * FROM topup_requests WHERE id = ?", [requestId.data]);

  if (!request) return { ok: false, message: "Заявка не найдена" };
  if (request.status === "completed") return { ok: false, message: "Заявка уже завершена" };

  if (action.data === "start_processing") {
    await dbRun(
      `UPDATE topup_requests
       SET status = 'processing', processed_by_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [admin.email, request.id],
    );

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Заявка взята в работу" };
  }

  if (action.data === "send_invoice") {
    if (!invoiceAmount.success) return { ok: false, message: "Введите сумму счёта больше 0 ₽" };

    await dbRun(
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
    return { ok: true, message: "Счёт отмечен как отправленный" };
  }

  if (action.data === "mark_paid") {
    await dbRun(
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
    return { ok: true, message: "Оплата отмечена как полученная. Теперь можно зачислить баланс." };
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
  return { ok: true, message: `Оплата подтверждена, баланс пополнен на ${amountToCredit.toLocaleString("ru-RU")} ₽` };
}

export async function checkoutFromBalanceAction(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const service = getServiceBySlug(slug);

  if (!user) return { ok: false, message: "Войдите, чтобы оплатить услугу" };
  if (!service) return { ok: false, message: "Услуга не найдена" };

  const result = await dbTransaction(async (tx) => {
    const freshUser = await dbTxGet<DbUser>(tx, "SELECT * FROM users WHERE id = ?", [user.id]);
    if (!freshUser || freshUser.balance < service.price) {
      return { ok: false, message: "Недостаточно средств на балансе" };
    }

    const order = await dbTxRun(
      tx,
      `INSERT INTO orders (user_id, service_slug, service_title, amount, payment_method, status)
       VALUES (?, ?, ?, ?, 'balance', 'paid')`,
      [freshUser.id, service.slug, service.title, service.price],
    );

    await dbTxRun(tx, "UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      service.price,
      freshUser.id,
    ]);
    await dbTxRun(
      tx,
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, ?, 'order_payment', ?)`,
      [freshUser.id, -service.price, `Оплата заказа #${order.lastInsertRowid}: ${service.title}`],
    );

    return { ok: true, message: "Заказ создан и оплачен с баланса" };
  });

  revalidatePath("/account");
  revalidatePath("/admin");
  return result;
}

export async function checkoutByCardAction(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const service = getServiceBySlug(slug);

  if (!user) return { ok: false, message: "Войдите, чтобы оформить оплату картой" };
  if (!service) return { ok: false, message: "Услуга не найдена" };

  const order = await dbRun(
    `INSERT INTO orders (user_id, service_slug, service_title, amount, payment_method, status)
     VALUES (?, ?, ?, ?, 'card', 'awaiting_payment')`,
    [user.id, service.slug, service.title, service.price],
  );

  await dbRun(
    `INSERT INTO transactions (user_id, amount, type, description)
     VALUES (?, ?, 'card_payment_request', ?)`,
    [user.id, 0, `Запрос оплаты картой по заказу #${order.lastInsertRowid}`],
  );

  revalidatePath("/account");
  revalidatePath("/admin");
  return { ok: true, message: "Заказ создан со статусом awaiting_payment. Менеджер свяжется с вами для оплаты." };
}

export async function requestServiceInvoicePaymentAction(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const service = getServiceBySlug(slug);

  if (!user) return { ok: false, message: "Войдите, чтобы запросить оплату по счёту" };
  if (!service) return { ok: false, message: "Услуга не найдена" };

  const orderId = await dbTransaction(async (tx) => {
    const order = await dbTxRun(
      tx,
      `INSERT INTO orders (user_id, service_slug, service_title, amount, payment_method, status)
       VALUES (?, ?, ?, ?, 'invoice', 'awaiting_payment')`,
      [user.id, service.slug, service.title, service.price],
    );

    await dbTxRun(
      tx,
      `INSERT INTO service_invoice_requests (user_id, order_id, service_slug, service_title, requested_amount)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, order.lastInsertRowid, service.slug, service.title, service.price],
    );

    await dbTxRun(
      tx,
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, 0, 'invoice_payment', ?)`,
      [user.id, `Запрос оплаты по счёту по заказу #${order.lastInsertRowid}: ${service.title}`],
    );

    return order.lastInsertRowid;
  });

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

  const request = await dbGet<DbServiceInvoiceRequest>("SELECT * FROM service_invoice_requests WHERE id = ?", [
    requestId.data,
  ]);

  if (!request) return { ok: false, message: "Заявка не найдена" };
  if (request.status === "completed") return { ok: false, message: "Заявка уже завершена" };

  if (action.data === "start_processing") {
    await dbRun(
      `UPDATE service_invoice_requests
       SET status = 'processing', processed_by_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [admin.email, request.id],
    );

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Заявка на оплату по счёту взята в работу" };
  }

  if (action.data === "send_invoice") {
    if (!invoiceAmount.success) return { ok: false, message: "Введите сумму счёта больше 0 ₽" };

    await dbTransaction(async (tx) => {
      await dbTxRun(
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

      await dbTxRun(tx, "UPDATE orders SET amount = ? WHERE id = ?", [invoiceAmount.data, request.order_id]);
    });

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true, message: "Счёт по услуге отмечен как отправленный" };
  }

  if (action.data === "mark_paid") {
    await dbRun(
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
    return { ok: true, message: "Оплата по счёту отмечена как полученная" };
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

    await dbTxRun(tx, "UPDATE orders SET status = 'paid', amount = ? WHERE id = ?", [paidAmount, freshRequest.order_id]);

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
  const orders = await dbAll<DbOrder>("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [userId]);
  const transactions = await dbAll<DbTransaction>(
    "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    [userId],
  );
  const topupRequests = await dbAll<DbTopupRequest>(
    "SELECT * FROM topup_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
    [userId],
  );
  const serviceInvoiceRequests = await dbAll<DbServiceInvoiceRequest>(
    "SELECT * FROM service_invoice_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    [userId],
  );
  return { orders, transactions, topupRequests, serviceInvoiceRequests };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  const users = await dbAll<AdminUserRow>(
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
  );

  const orders = await dbAll<DbOrder>("SELECT * FROM orders ORDER BY created_at DESC");
  const transactions = await dbAll<DbTransaction>("SELECT * FROM transactions ORDER BY created_at DESC");

  const topupRequests = await dbAll<DbTopupRequest & { email: string }>(
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
  );

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
    totalBalance: number;
    totalOrders: number;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COALESCE(SUM(balance), 0) FROM users) AS totalBalance,
      (SELECT COUNT(*) FROM orders) AS totalOrders`,
  );

  return {
    users,
    orders,
    transactions,
    topupRequests,
    serviceInvoiceRequests,
    contactRequests,
    totalUsers: totals?.totalUsers ?? 0,
    totalBalance: totals?.totalBalance ?? 0,
    totalOrders: totals?.totalOrders ?? 0,
  };
}