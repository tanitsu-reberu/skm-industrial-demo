export const checkoutConsultationNotice =
  "Перед оплатой менеджер согласует с вами детали заказа, итоговую стоимость и способ оплаты. Уточнить всё можно в онлайн-чате на сайте — кнопка в правом нижнем углу.";

export function checkoutRequestCreatedMessage(paymentLabel: string, orderId: number | bigint) {
  return `Заявка на «${paymentLabel}» создана (заказ #${orderId}). Напишите в онлайн-чат на сайте: согласуем детали, итоговую стоимость и сумму списания с баланса или оформим счёт.`;
}