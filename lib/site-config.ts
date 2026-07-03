export const siteConfig = {
  companyName: "ООО СКМ",
  shortName: "СКМ",
  logoPath: "/logo.png",
  phone: "+7 991 123 05 07",
  phoneHref: "tel:+79911230507",
  email: "i@ooo-skmoscow.ru",
  emailHref: "mailto:i@ooo-skmoscow.ru",
  bankDetails: {
    recipient: "ООО СКМ",
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
