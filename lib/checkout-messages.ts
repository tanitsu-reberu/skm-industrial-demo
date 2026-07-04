export const checkoutConsultationNotice =
  "Оплата только по счёту. Сначала напишите в онлайн-чат на сайте — согласуем детали заказа, итоговую стоимость и выставим счёт.";

export function checkoutInvoiceCreatedMessage(orderId: number | bigint) {
  return `Заявка на оплату по счёту создана (заказ #${orderId}). Напишите в онлайн-чат: согласуем детали и подготовим счёт.`;
}