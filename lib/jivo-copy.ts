/** Рекомендуемые русские тексты — дублируйте в кабинете Jivo: Каналы → Настроить виджет. */
export const jivoRussianCopy = {
  welcome: "Здравствуйте! Чем могу помочь?",
  chatButton: "Чат с поддержкой",
  inputPlaceholder: "Напишите сообщение...",
  offline: "Мы сейчас не в сети. Оставьте сообщение, и мы ответим в ближайшее время.",
  guestName: "Клиент",
} as const;

export const jivoRussianReplacements: ReadonlyArray<readonly [string, string]> = [
  ["Customer Support", "Поддержка"],
  ["Hi! How can we help?", jivoRussianCopy.welcome],
  ["How can I help you?", jivoRussianCopy.welcome],
  ["Hello! How can we help?", jivoRussianCopy.welcome],
  ["Chat with support", jivoRussianCopy.chatButton],
  ["Live chat", jivoRussianCopy.chatButton],
  ["Write a message...", jivoRussianCopy.inputPlaceholder],
  ["Write a message", jivoRussianCopy.inputPlaceholder],
  ["Type a message", jivoRussianCopy.inputPlaceholder],
  ["We are not online right now", "Мы сейчас не в сети"],
  ["We're not online right now", "Мы сейчас не в сети"],
  ["Send", "Отправить"],
  ["Submit", "Отправить"],
  ["Offline", "Не в сети"],
  ["Online", "В сети"],
  ["Typing...", "Печатает..."],
  ["New message", "Новое сообщение"],
  ["Leave a message", "Оставить сообщение"],
  ["Start chat", "Начать чат"],
  ["Powered by JivoChat", ""],
  ["Powered by Jivo", ""],
];