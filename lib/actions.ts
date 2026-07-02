"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, destroySession, getCurrentUser, hashOtp } from "@/lib/auth";
import { db, type DbOrder, type DbTopupRequest, type DbTransaction, type DbUser, upsertUserByEmail } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";
import { getServiceBySlug } from "@/lib/services";
import { siteConfig } from "@/lib/site-config";

export type ActionResult = {
  ok: boolean;
  message: string;
  code?: string;
};

export type AdminUserRow = DbUser & {
  last_topup_at: string | null;
  total_orders: number;
};

export type AdminSnapshot = {
  users: AdminUserRow[];
  orders: DbOrder[];
  topupRequests: Array<DbTopupRequest & { email: string }>;
};

const emailSchema = z.string().email("Введите корректный email").toLowerCase();
const amountSchema = z.coerce.number().int().min(100).max(500000);
const signedAmountSchema = z.coerce.number().int().min(-500000).max(500000).refine((value) => value !== 0, {
  message: "Сумма не должна быть нулевой",
});

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
  const code = randomOtp();
  const expiresInMinutes = 10;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO otp_codes (email, code_hash, expires_at)
     VALUES (?, ?, ?)`,
  ).run(email, hashOtp(email, code), expiresAt);

  await sendOtpEmail({ email, code, expiresInMinutes });

  const showDemoOtp = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";
  return {
    ok: true,
    message: showDemoOtp
      ? `Demo OTP: ${code}. Код также выведен в консоль сервера.`
      : "Код отправлен на email.",
    code: showDemoOtp ? code : undefined,
  };
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
  if (!parsed.success) return { ok: false, message: "Введите сумму от 100 до 500 000 ₽" };

  const amount = parsed.data;
  const comment = z.string().max(300).optional().parse(formData.get("comment")?.toString() || undefined);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO balance_topup_requests (user_id, amount, comment)
       VALUES (?, ?, ?)`,
    ).run(user.id, amount, comment ?? null);

    db.prepare(
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, ?, 'balance_request', ?)`,
    ).run(user.id, 0, `Запрос пополнения на ${amount.toLocaleString("ru-RU")} ₽`);
  })();

  revalidatePath("/account");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Запрос создан. Реквизиты: ${siteConfig.bankDetails.recipient}. Менеджер сверит оплату и пополнит баланс.`,
  };
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

export async function adminAdjustBalanceAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Недостаточно прав" };

  const userId = z.coerce.number().int().positive().safeParse(formData.get("userId"));
  const amount = signedAmountSchema.safeParse(formData.get("amount"));
  const reason = z.string().max(200).optional().parse(formData.get("reason")?.toString() || undefined);

  if (!userId.success || !amount.success) {
    return { ok: false, message: "Проверьте пользователя и сумму" };
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId.data) as DbUser | undefined;
  if (!user) return { ok: false, message: "Пользователь не найден" };
  if (user.balance + amount.data < 0) return { ok: false, message: "Баланс не может уйти ниже нуля" };

  db.transaction(() => {
    db.prepare("UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amount.data, user.id);
    db.prepare(
      `INSERT INTO transactions (user_id, amount, type, description)
       VALUES (?, ?, 'admin_adjustment', ?)`,
    ).run(user.id, amount.data, reason || `Корректировка администратором ${admin.email}`);
  })();

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true, message: "Баланс пользователя обновлен" };
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
    .prepare("SELECT * FROM balance_topup_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 10")
    .all(userId) as DbTopupRequest[];
  return { orders, transactions, topupRequests };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  const users = db
    .prepare(
      `SELECT
        users.*,
        (SELECT MAX(created_at) FROM transactions WHERE transactions.user_id = users.id AND transactions.amount > 0) AS last_topup_at,
        (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id) AS total_orders
       FROM users
       ORDER BY users.created_at DESC`,
    )
    .all() as AdminUserRow[];

  const orders = db
    .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 30")
    .all() as DbOrder[];

  const topupRequests = db
    .prepare(
      `SELECT balance_topup_requests.*, users.email
       FROM balance_topup_requests
       JOIN users ON users.id = balance_topup_requests.user_id
       ORDER BY balance_topup_requests.created_at DESC
       LIMIT 30`,
    )
    .all() as Array<DbTopupRequest & { email: string }>;

  return { users, orders, topupRequests };
}
