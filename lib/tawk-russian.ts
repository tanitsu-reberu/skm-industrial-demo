/** Системные фразы Tawk.to → русский (fallback, если Language в dashboard не срабатывает). */
export const tawkRussianReplacements: ReadonlyArray<readonly [string, string]> = [
  [
    "Need help? Search our help center for answers or start a conversation:",
    "Нужна помощь? Найдите ответ в базе знаний или начните диалог:",
  ],
  [
    "Need help? Search our help center for answers or start a conversation",
    "Нужна помощь? Найдите ответ в базе знаний или начните диалог",
  ],
  ["Search our help center for answers or start a conversation", "Найдите ответ в базе знаний или начните диалог"],
  ["Hi there!", "Здравствуйте!"],
  ["Hi there", "Здравствуйте!"],
  ["Need help?", "Нужна помощь?"],
  ["We typically reply in a few minutes", "Обычно отвечаем в течение нескольких минут"],
  ["We typically reply instantly", "Обычно отвечаем быстро"],
  ["We typically reply in a day", "Обычно отвечаем в течение дня"],
  ["Type here and press enter to chat", "Напишите сообщение и нажмите Enter"],
  ["Type here and press enter..", "Напишите сообщение и нажмите Enter"],
  ["Type here", "Напишите сообщение"],
  ["New Conversation", "Новый диалог"],
  ["Recent Conversations", "Недавние диалоги"],
  ["Start Chat", "Начать чат"],
  ["Chat with us", "Написать нам"],
  ["Send", "Отправить"],
  ["Submit", "Отправить"],
  ["Your Name", "Имя"],
  ["Name", "Имя"],
  ["Your Email", "Email"],
  ["Email", "Email"],
  ["Phone", "Телефон"],
  ["Message", "Сообщение"],
  ["Leave a message", "Оставить сообщение"],
  ["Offline", "Не в сети"],
  ["Online", "В сети"],
  ["Away", "Отошли"],
  ["Agents are available", "Операторы на связи"],
  ["Agents not available", "Операторы недоступны"],
  ["Search", "Поиск"],
  ["Knowledge Base", "База знаний"],
  ["Powered by tawk.to", ""],
  ["Add free live chat to your site", ""],
  ["Rate this chat", "Оцените консультацию"],
  ["How would you rate this chat?", "Как вам ответили?"],
  ["Good", "Хорошо"],
  ["Bad", "Плохо"],
];

export function applyTawkRussianText(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    let value = node.nodeValue;
    if (!value?.trim()) continue;

    for (const [from, to] of tawkRussianReplacements) {
      if (value.includes(from)) {
        value = value.split(from).join(to);
      }
    }

    if (value !== node.nodeValue) {
      node.nodeValue = value;
    }
  }
}