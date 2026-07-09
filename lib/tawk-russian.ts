/** Системные фразы Tawk.to → русский (fallback, если Language в dashboard не срабатывает). */
export const tawkRussianCopy = {
  welcome: "Здравствуйте! Чем могу помочь?",
  chatButton: "Чат с поддержкой",
  offline:
    "Мы в настоящее время не в сети. Оставьте сообщение, и мы ответим в ближайшее время.",
  guestName: "Клиент",
} as const;

export const tawkRussianReplacements: ReadonlyArray<readonly [string, string]> = [
  ["Customer Support", "Поддержка"],
  ["Hi! How can we help?", tawkRussianCopy.welcome],
  ["I have a question", "У меня вопрос"],
  ["Tell me more", "Расскажите подробнее"],
  ["Write a message...", "Напишите сообщение..."],
  ["Write a message", "Напишите сообщение"],
  ["We are not online right now", "Мы сейчас не в сети"],
  ["We're not online right now", "Мы сейчас не в сети"],
  ["Hi there! How can we help?", tawkRussianCopy.welcome],
  ["Hi there! How can we help", tawkRussianCopy.welcome],
  ["Hello! How can we help?", tawkRussianCopy.welcome],
  ["How can we help?", "Чем могу помочь?"],
  ["How can we help", "Чем могу помочь?"],
  ["Hi there!", "Здравствуйте!"],
  ["Hi there", "Здравствуйте!"],
  ["Hello!", "Здравствуйте!"],
  ["Hello", "Здравствуйте!"],
  ["Welcome!", "Здравствуйте!"],
  ["Welcome", "Здравствуйте!"],
  [
    "Need help? Search our help center for answers or start a conversation:",
    "Нужна помощь? Найдите ответ в базе знаний или начните диалог:",
  ],
  [
    "Need help? Search our help center for answers or start a conversation",
    "Нужна помощь? Найдите ответ в базе знаний или начните диалог",
  ],
  ["Search our help center for answers or start a conversation", "Найдите ответ в базе знаний или начните диалог"],
  ["Need help?", "Нужна помощь?"],
  ["We're here to help", "Мы на связи"],
  ["We are here to help", "Мы на связи"],
  ["Ask us anything", "Задайте вопрос"],
  ["Ask a question", "Задать вопрос"],
  ["Chat with us", tawkRussianCopy.chatButton],
  ["Live Chat", tawkRussianCopy.chatButton],
  ["Live chat", tawkRussianCopy.chatButton],
  ["Start Chat", "Начать чат"],
  ["Start chat", "Начать чат"],
  ["New Conversation", "Новый диалог"],
  ["Recent Conversations", "Недавние диалоги"],
  [
    "We are currently offline. Leave a message and we'll get back to you as soon as we can.",
    tawkRussianCopy.offline,
  ],
  [
    "We're currently offline. Leave a message and we'll get back to you as soon as we can.",
    tawkRussianCopy.offline,
  ],
  [
    "Sorry, we're not online at the moment. Leave a message and we'll get back to you.",
    tawkRussianCopy.offline,
  ],
  [
    "Sorry, we are not online at the moment. Leave a message and we'll get back to you.",
    tawkRussianCopy.offline,
  ],
  ["We're offline. Leave us a message and we'll get back to you.", tawkRussianCopy.offline],
  ["We are offline. Leave us a message and we'll get back to you.", tawkRussianCopy.offline],
  ["We're offline. Leave a message and we'll get back to you.", tawkRussianCopy.offline],
  ["We are offline. Leave a message and we'll get back to you.", tawkRussianCopy.offline],
  ["All agents are offline", "Все операторы не в сети"],
  ["No agents available", "Операторы недоступны"],
  ["Agents not available", "Операторы недоступны"],
  ["Agents are available", "Операторы на связи"],
  ["We typically reply in a few minutes", "Обычно отвечаем в течение нескольких минут"],
  ["We typically reply instantly", "Обычно отвечаем быстро"],
  ["We typically reply in a day", "Обычно отвечаем в течение дня"],
  ["Type here and press enter to chat", "Напишите сообщение и нажмите Enter"],
  ["Type here and press enter..", "Напишите сообщение и нажмите Enter"],
  ["Type here and press enter", "Напишите сообщение и нажмите Enter"],
  ["Type here", "Напишите сообщение"],
  ["Type a message", "Напишите сообщение"],
  ["Enter your message", "Введите сообщение"],
  ["Get in touch", "Связаться с нами"],
  ["Chat now", "Начать чат"],
  ["Just browsing", "Просто смотрю"],
  ["Sales", "Продажи"],
  ["Help", "Помощь"],
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
  ["Search", "Поиск"],
  ["Knowledge Base", "База знаний"],
  ["Powered by tawk.to", ""],
  ["Add free live chat to your site", ""],
  ["Rate this chat", "Оцените консультацию"],
  ["How would you rate this chat?", "Как вам ответили?"],
  ["Good", "Хорошо"],
  ["Bad", "Плохо"],
  ["Support", "Поддержка"],
  ["Cancel", "Отмена"],
  ["Close", "Закрыть"],
  ["Minimize", "Свернуть"],
  ["Upload file", "Загрузить файл"],
  ["Attach file", "Прикрепить файл"],
  ["Connecting...", "Подключение..."],
  ["Loading...", "Загрузка..."],
  ["Please wait", "Подождите"],
  ["Thank you", "Спасибо"],
  ["Your message has been sent", "Сообщение отправлено"],
  ["We'll be back soon", "Скоро вернёмся"],
  ["Department", "Отдел"],
  ["Select a department", "Выберите отдел"],
  ["Fill in the form below", "Заполните форму ниже"],
  ["Please fill in the form below", "Заполните форму ниже"],
  ["Back", "Назад"],
  ["Continue", "Продолжить"],
  ["Yes", "Да"],
  ["No", "Нет"],
  ["Yesterday", "Вчера"],
  ["Today", "Сегодня"],
  ["Now", "Сейчас"],
  ["Typing...", "Печатает..."],
  ["Agent is typing", "Оператор печатает..."],
  ["New message", "Новое сообщение"],
  ["Chat ended", "Чат завершён"],
  ["End chat", "Завершить чат"],
  ["Are you sure you want to end this chat?", "Завершить этот чат?"],
  ["Reconnecting", "Переподключение..."],
];

const ATTRIBUTE_KEYS = ["aria-label", "title", "placeholder", "alt"] as const;

function replaceRussianText(value: string) {
  let next = value;

  for (const [from, to] of tawkRussianReplacements) {
    if (next.includes(from)) {
      next = next.split(from).join(to);
    }
  }

  return next;
}

export function applyTawkRussianText(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of textNodes) {
    const value = node.nodeValue;
    if (!value?.trim()) continue;

    const next = replaceRussianText(value);
    if (next !== value) {
      node.nodeValue = next;
    }
  }

  const elements =
    root instanceof Document || root instanceof Element
      ? root.querySelectorAll<HTMLElement>("*")
      : [];

  for (const element of elements) {
    for (const key of ATTRIBUTE_KEYS) {
      const value = element.getAttribute(key);
      if (!value?.trim()) continue;

      const next = replaceRussianText(value);
      if (next !== value) {
        element.setAttribute(key, next);
      }
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const placeholder = element.placeholder;
      if (placeholder?.trim()) {
        const next = replaceRussianText(placeholder);
        if (next !== placeholder) {
          element.placeholder = next;
        }
      }
    }
  }

  if (root instanceof Document || root instanceof Element) {
    for (const node of root.querySelectorAll<HTMLElement>(".tawk-text, [class*='tawk']")) {
      const text = node.textContent;
      if (!text?.trim() || !node.childElementCount) continue;

      const next = replaceRussianText(text);
      if (next !== text && node.childElementCount === 0) {
        node.textContent = next;
      }
    }
  }
}

export function findTawkIframes(root: ParentNode = document) {
  if (!(root instanceof Document || root instanceof Element)) {
    return [] as HTMLIFrameElement[];
  }

  return Array.from(
    root.querySelectorAll<HTMLIFrameElement>(
      "iframe[title*='chat' i], iframe[id*='tawk' i], iframe[src*='tawk' i], .tawk-min-container iframe, .tawk-max-container iframe",
    ),
  );
}

export function localizeTawkIframe(iframe: HTMLIFrameElement, iframeStyle?: string) {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return false;

    if (iframeStyle && !doc.getElementById("skm-tawk-iframe-brand")) {
      const style = doc.createElement("style");
      style.id = "skm-tawk-iframe-brand";
      style.textContent = iframeStyle;
      (doc.head ?? doc.documentElement).appendChild(style);
    }

    applyTawkRussianText(doc.body ?? doc.documentElement);
    return true;
  } catch {
    return false;
  }
}

const boundIframes = new WeakSet<HTMLIFrameElement>();

export function localizeAllTawkWidgets(iframeStyle?: string) {
  applyTawkRussianText(document.body);

  for (const iframe of findTawkIframes()) {
    if (!boundIframes.has(iframe)) {
      boundIframes.add(iframe);
      iframe.addEventListener("load", () => localizeTawkIframe(iframe, iframeStyle));
    }
    localizeTawkIframe(iframe, iframeStyle);
  }
}

export function buildTawkRussianBootScript(iframeStyle: string) {
  const pairsJson = JSON.stringify(tawkRussianReplacements);
  const iframeStyleJson = JSON.stringify(iframeStyle);

  return `
(function () {
  var pairs = ${pairsJson};
  var iframeStyle = ${iframeStyleJson};
  var attributeKeys = ["aria-label", "title", "placeholder", "alt"];

  function replaceText(value) {
    var next = value;
    for (var i = 0; i < pairs.length; i += 1) {
      var from = pairs[i][0];
      var to = pairs[i][1];
      if (next.indexOf(from) !== -1) {
        next = next.split(from).join(to);
      }
    }
    return next;
  }

  function applyRussian(root) {
    if (!root) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    var current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }

    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var value = node.nodeValue;
      if (!value || !String(value).trim()) continue;
      var next = replaceText(value);
      if (next !== value) node.nodeValue = next;
    }

    var elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var j = 0; j < elements.length; j += 1) {
      var element = elements[j];
      for (var k = 0; k < attributeKeys.length; k += 1) {
        var key = attributeKeys[k];
        var attr = element.getAttribute(key);
        if (!attr || !String(attr).trim()) continue;
        var replaced = replaceText(attr);
        if (replaced !== attr) element.setAttribute(key, replaced);
      }
    }
  }

  var iframeObservers = new WeakSet();

  function observeIframeDocument(iframe) {
    try {
      var doc = iframe.contentDocument;
      if (!doc || !doc.body || iframeObservers.has(doc)) return;
      iframeObservers.add(doc);
      var iframeObserver = new MutationObserver(function () {
        scheduleLocalize();
      });
      iframeObserver.observe(doc.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  }

  function localizeIframe(iframe) {
    try {
      var doc = iframe.contentDocument;
      if (!doc) return;
      if (!doc.getElementById("skm-tawk-iframe-brand")) {
        var style = doc.createElement("style");
        style.id = "skm-tawk-iframe-brand";
        style.textContent = iframeStyle;
        (doc.head || doc.documentElement).appendChild(style);
      }
      applyRussian(doc.body || doc.documentElement);
      observeIframeDocument(iframe);
    } catch (e) {}
  }

  function bindIframe(iframe) {
    if (iframe.__skmTawkBound) return;
    iframe.__skmTawkBound = true;
    iframe.addEventListener("load", function () {
      localizeIframe(iframe);
      scheduleBurst();
    });
    localizeIframe(iframe);
  }

  function localizeAll() {
    applyRussian(document.body);
    var iframes = document.querySelectorAll(
      "iframe[title*='chat' i], iframe[id*='tawk' i], iframe[src*='tawk' i], .tawk-min-container iframe, .tawk-max-container iframe"
    );
    for (var i = 0; i < iframes.length; i += 1) {
      bindIframe(iframes[i]);
    }
  }

  window.__skmLocalizeTawk = localizeAll;

  var burstTimer = null;
  var observeTimer = null;

  function scheduleBurst() {
    localizeAll();
    if (burstTimer) return;
    var attempts = 0;
    burstTimer = window.setInterval(function () {
      localizeAll();
      attempts += 1;
      if (attempts >= 24) {
        window.clearInterval(burstTimer);
        burstTimer = null;
      }
    }, 250);
  }

  function scheduleLocalize() {
    if (observeTimer) window.clearTimeout(observeTimer);
    observeTimer = window.setTimeout(localizeAll, 50);
  }

  function chainCallback(name, handler) {
    var api = window.Tawk_API = window.Tawk_API || {};
    var previous = api[name];
    api[name] = function () {
      if (typeof previous === "function") {
        try { previous.apply(this, arguments); } catch (e) {}
      }
      try { handler.apply(this, arguments); } catch (e) {}
    };
  }

  chainCallback("onBeforeLoad", scheduleBurst);
  chainCallback("onLoad", function () {
    scheduleBurst();
    if (!window.Tawk_API || !window.Tawk_API.setAttributes) return;
    if (window.Tawk_API.visitor && window.Tawk_API.visitor.email) return;
    window.Tawk_API.setAttributes({ name: ${JSON.stringify(tawkRussianCopy.guestName)} }, function () {});
  });
  chainCallback("onChatMaximized", scheduleBurst);
  chainCallback("onStatusChange", scheduleBurst);
  chainCallback("onChatStarted", scheduleBurst);
  chainCallback("onChatMessageAgent", scheduleBurst);
  chainCallback("onChatMessageSystem", scheduleBurst);

  window.addEventListener("pageshow", scheduleBurst);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) scheduleBurst();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBurst);
  } else {
    scheduleBurst();
  }

  function startObserver() {
    if (!document.body) return;
    var observer = new MutationObserver(function () {
      scheduleLocalize();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver);
  }
})();
`;
}