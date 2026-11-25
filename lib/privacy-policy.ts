export const privacyPolicyPath = "/politika";
export const privacyPolicyFilePath = "/documents/politika-konfidentsialnosti-skm.docx";
export const contactConsentPath = "/soglasie";
export const contactConsentVersion = "2026-11-25-owner";
export const contactRequestsEnabled = process.env.NEXT_PUBLIC_CONTACT_REQUESTS_ENABLED === "1";
export const privacyConsentPath = "/soglasie-administratora";
export const privacyConsentVersion = "2026-11-22";
export const privacyConsentField = "privacyConsent";

export function hasPrivacyConsent(formData: FormData) {
  const value = formData.get(privacyConsentField);
  return value === "on" || value === "true" || value === "1";
}
export const privacyConsentMessage = "Подтвердите согласие на обработку персональных данных.";
export const privacyPolicyMeta = {
  title: "Политика обработки персональных данных | СКМ",
  description: "Политика ООО «СКМ» в отношении обработки персональных данных пользователей сайта service-skm.ru.",
};
