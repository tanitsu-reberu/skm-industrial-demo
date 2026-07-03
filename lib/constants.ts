// Admin access is intentionally controlled by one email for the MVP.
// Change this value, or set ADMIN_EMAIL in .env.local, to transfer admin access.
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "admin@skm.ru").trim().toLowerCase();
