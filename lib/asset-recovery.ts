/** Client-side recovery when cached HTML references stale /_next/static assets (common on iPad after deploy). */
export const assetRecoveryScript = `
(function () {
  var retryParam = "__skm_assets";

  function retryWithFreshHtml() {
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
      retryWithFreshHtml();
      return;
    }

    if (tagName === "SCRIPT" && target.src && target.src.indexOf("/_next/static/") !== -1) {
      retryWithFreshHtml();
    }
  }, true);

  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    var cssReady = getComputedStyle(document.documentElement).getPropertyValue("--skm-css-ready").trim();
    if (cssReady !== "1") retryWithFreshHtml();
  });

  window.addEventListener("load", function () {
    var url = new URL(window.location.href);
    if (!url.searchParams.has(retryParam)) return;
    url.searchParams.delete(retryParam);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, { once: true });
})();`.trim();
