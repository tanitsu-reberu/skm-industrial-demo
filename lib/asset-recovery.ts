/** Client-side recovery when cached HTML references stale /_next/static assets (common on iPad after deploy). */
export const assetRecoveryScript = `
(function () {
  var retryParam = "__skm_assets";
  var storageKey = "skm:asset-retry";
  var maxRetries = 1;

  function reloadStylesheet(link) {
    if (!link || link.dataset.skmRetried) return false;
    link.dataset.skmRetried = "1";
    var href = link.href || link.getAttribute("href");
    if (!href) return false;
    var url = new URL(href, window.location.href);
    url.searchParams.set("__skm_css", Date.now().toString());
    link.href = url.toString();
    return true;
  }

  function reloadAllStylesheets() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var changed = false;
    for (var i = 0; i < links.length; i += 1) {
      if (reloadStylesheet(links[i])) changed = true;
    }
    return changed;
  }

  function retryWithFreshHtml() {
    var retries = Number(sessionStorage.getItem(storageKey) || "0");
    if (retries >= maxRetries) return;
    sessionStorage.setItem(storageKey, String(retries + 1));

    var url = new URL(window.location.href);
    if (url.searchParams.has(retryParam)) return;
    url.searchParams.set(retryParam, Date.now().toString());
    window.location.replace(url.toString());
  }

  window.addEventListener("error", function (event) {
    var target = event.target;
    if (!target || !target.tagName) return;

    var tagName = target.tagName.toUpperCase();
    if (tagName === "LINK" && target.rel === "stylesheet") {
      if (!reloadStylesheet(target)) retryWithFreshHtml();
      return;
    }

    if (tagName === "SCRIPT" && target.src && target.src.indexOf("/_next/static/") !== -1) {
      retryWithFreshHtml();
    }
  }, true);

  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    reloadAllStylesheets();
  });

  window.addEventListener("load", function () {
    sessionStorage.removeItem(storageKey);

    var url = new URL(window.location.href);
    if (!url.searchParams.has(retryParam)) return;
    url.searchParams.delete(retryParam);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, { once: true });
})();`.trim();