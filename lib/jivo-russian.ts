import { jivoRussianReplacements } from "@/lib/jivo-copy";

const ATTRIBUTE_KEYS = ["aria-label", "title", "placeholder", "alt"] as const;

function replaceRussianText(value: string) {
  let next = value;

  for (const [from, to] of jivoRussianReplacements) {
    if (next.includes(from)) {
      next = next.split(from).join(to);
    }
  }

  return next;
}

export function applyJivoRussianText(root: ParentNode) {
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
      const attr = element.getAttribute(key);
      if (!attr?.trim()) continue;

      const next = replaceRussianText(attr);
      if (next !== attr) {
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
}

export function localizeJivoWidget() {
  applyJivoRussianText(document.body);

  const jivoRoots = document.querySelectorAll("#jivo_chat_widget, #jivo_custom_widget, jdiv, [id^='jivo']");
  for (const root of jivoRoots) {
    applyJivoRussianText(root);
  }
}

export function buildJivoRussianBootScript() {
  const pairsJson = JSON.stringify(jivoRussianReplacements);

  return `
(function () {
  var pairs = ${pairsJson};
  var attributeKeys = ["aria-label", "title", "placeholder", "alt"];
  var observeTimer = null;
  var burstTimer = null;

  function replaceText(value) {
    var next = value;
    for (var i = 0; i < pairs.length; i += 1) {
      var from = pairs[i][0];
      var to = pairs[i][1];
      if (next.indexOf(from) !== -1) next = next.split(from).join(to);
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
      if (element.placeholder) {
        var ph = replaceText(element.placeholder);
        if (ph !== element.placeholder) element.placeholder = ph;
      }
    }
  }

  function localizeAll() {
    applyRussian(document.body);
    var roots = document.querySelectorAll("#jivo_chat_widget, #jivo_custom_widget, jdiv, [id^='jivo']");
    for (var i = 0; i < roots.length; i += 1) applyRussian(roots[i]);
  }

  window.__skmLocalizeJivo = localizeAll;

  function scheduleBurst() {
    localizeAll();
    if (burstTimer) return;
    var attempts = 0;
    burstTimer = window.setInterval(function () {
      localizeAll();
      attempts += 1;
      if (attempts >= 30) {
        window.clearInterval(burstTimer);
        burstTimer = null;
      }
    }, 300);
  }

  function scheduleLocalize() {
    if (observeTimer) window.clearTimeout(observeTimer);
    observeTimer = window.setTimeout(localizeAll, 50);
  }

  var previousOnLoad = window.jivo_onLoadCallback;
  window.jivo_onLoadCallback = function () {
    if (typeof previousOnLoad === "function") {
      try { previousOnLoad(); } catch (e) {}
    }
    scheduleBurst();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBurst);
  } else {
    scheduleBurst();
  }

  window.addEventListener("pageshow", scheduleBurst);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) scheduleBurst();
  });

  function startObserver() {
    if (!document.body) return;
    var observer = new MutationObserver(function () {
      scheduleLocalize();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.body) startObserver();
  else document.addEventListener("DOMContentLoaded", startObserver);
})();
`;
}