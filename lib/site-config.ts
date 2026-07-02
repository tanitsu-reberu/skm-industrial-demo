export const siteConfig = {
  companyName: "ООО Сервис Компрессорных Машин",
  shortName: "СКМ",
  logoPath: "/logo.png",
  phone: "+7 999 000-00-00",
  phoneHref: "tel:+79990000000",
  email: "service@skm.example",
  emailHref: "mailto:service@skm.example",
  telegramUrl: "https://t.me/skm_support_bot",
  bankDetails: {
    recipient: "ООО Сервис Компрессорных Машин",
    bank: "Банк для оплаты будет указан менеджером",
    purpose: "Пополнение внутреннего баланса СКМ",
  },
};

export function configuredAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "admin@skm.ru";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
