export const siteConfig = {
  companyName: "ООО «СКМ»",
  legalName: "Общество с ограниченной ответственностью «Сервис Компрессорных Машин»",
  inn: "9717171905",
  kpp: "771701001",
  ogrn: "1247700722840",
  legalAddress: "129164, г. Москва, вн. г. муниципальный округ Алексеевский, бульвар Ракетный, д. 16",
  director: "Павленко Дмитрий Александрович",
  shortName: "СКМ",
  logoPath: "/logo.png",
  phone: "+7 991 123-05-07",
  phoneHref: "tel:+79911230507",
  email: "ooo-skmoscow@yandex.ru",
  emailHref: "mailto:ooo-skmoscow@yandex.ru",
  bankDetails: {
    recipient: "ООО «СКМ»",
    bank: "АО «АЛЬФА-БАНК», г. Москва",
    account: "40702810801570000035",
    correspondentAccount: "30101810200000000593",
    bik: "044525593",
    purpose: "Оплата услуг СКМ по счёту",
  },
};

export function configuredAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "admin@skm.ru";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
