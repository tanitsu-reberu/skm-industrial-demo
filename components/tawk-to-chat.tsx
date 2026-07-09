"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { tawkIframeBrandCss, tawkPageBrandCss } from "@/lib/tawk-brand";
import { buildTawkRussianBootScript, localizeAllTawkWidgets } from "@/lib/tawk-russian";

type TawkVisitor = {
  name: string;
  email: string;
};

type TawkToChatProps = {
  propertyId: string;
  widgetId: string;
  visitor?: TawkVisitor | null;
  /** Если true — виджет скрыт для гостей. См. NEXT_PUBLIC_TAWK_AUTH_ONLY в .env */
  authOnly?: boolean;
  isAuthenticated?: boolean;
};

declare global {
  interface Window {
    Tawk_API?: {
      onBeforeLoad?: () => void;
      onLoad?: () => void;
      onChatMaximized?: () => void;
      onStatusChange?: (status: string) => void;
      visitor?: TawkVisitor;
      setAttributes?: (
        attributes: Record<string, string>,
        callback?: (error: Error | null) => void,
      ) => void;
      hideWidget?: () => void;
      showWidget?: () => void;
      maximize?: () => void;
      toggle?: () => void;
      customStyle?: {
        zIndex?: number | string;
      };
    };
    Tawk_LoadStart?: Date;
    __skmLocalizeTawk?: () => void;
  }
}

const PAGE_STYLE_ID = "skm-tawk-page-brand";

function ensurePageBrandStyles() {
  if (document.getElementById(PAGE_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = tawkPageBrandCss;
  document.head.appendChild(style);
}

function runLocalization() {
  ensurePageBrandStyles();
  window.__skmLocalizeTawk?.();
  localizeAllTawkWidgets(tawkIframeBrandCss);
}

function chainTawkCallback(name: "onLoad" | "onBeforeLoad" | "onChatMaximized" | "onStatusChange", handler: () => void) {
  window.Tawk_API = window.Tawk_API || {};
  const previous = window.Tawk_API[name];
  window.Tawk_API[name] = function chainedTawkCallback(...args: unknown[]) {
    if (typeof previous === "function") {
      try {
        (previous as (...innerArgs: unknown[]) => void).apply(this, args);
      } catch {
        // keep widget alive even if a previous handler fails
      }
    }
    handler();
  };
}

export function TawkToChat({
  propertyId,
  widgetId,
  visitor = null,
  authOnly = false,
  isAuthenticated = false,
}: TawkToChatProps) {
  const pathname = usePathname();
  const shouldShowWidget = !authOnly || isAuthenticated;
  const russianBootScript = buildTawkRussianBootScript(tawkIframeBrandCss);

  useEffect(() => {
    ensurePageBrandStyles();
    const originalTitle = document.title;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_API.customStyle = { zIndex: 9990 };

    const handleWidgetReady = () => {
      runLocalization();

      if (visitor?.email) {
        window.Tawk_API?.setAttributes?.(
          {
            name: visitor.name,
            email: visitor.email,
          },
          () => undefined,
        );
      }

      if (!shouldShowWidget) {
        window.Tawk_API?.hideWidget?.();
        return;
      }

      window.Tawk_API?.showWidget?.();
    };

    chainTawkCallback("onLoad", handleWidgetReady);
    chainTawkCallback("onChatMaximized", runLocalization);
    chainTawkCallback("onStatusChange", runLocalization);

    runLocalization();

    const localizeTimer = window.setInterval(runLocalization, 1000);
    const titleTimer = window.setInterval(() => {
      if (/новое сообщение|new message/i.test(document.title)) {
        document.title = originalTitle;
      }
    }, 1000);

    return () => {
      window.clearInterval(localizeTimer);
      window.clearInterval(titleTimer);
    };
  }, [pathname, shouldShowWidget, visitor?.email, visitor?.name]);

  const visitorInit = visitor
    ? `window.Tawk_API.visitor = { name: ${JSON.stringify(visitor.name)}, email: ${JSON.stringify(visitor.email)} };`
    : "";

  return (
    <Script id="tawk-embed" strategy="afterInteractive">
      {`
        ${russianBootScript}
        window.Tawk_API = window.Tawk_API || {};
        window.Tawk_LoadStart = new Date();
        window.Tawk_API.customStyle = { zIndex: 9990 };
        ${visitorInit}
        (function () {
          var originalConsoleError = console.error.bind(console);
          console.error = function () {
            var first = arguments[0];
            if (
              first &&
              String(first.message || first).indexOf("Unable to store cookie") !== -1
            ) {
              return;
            }
            return originalConsoleError.apply(console, arguments);
          };

          var titleDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "title");
          if (titleDescriptor && titleDescriptor.set && titleDescriptor.get) {
            Object.defineProperty(Document.prototype, "title", {
              configurable: true,
              enumerable: titleDescriptor.enumerable,
              get: function () {
                return titleDescriptor.get.call(this);
              },
              set: function (value) {
                if (/новое сообщение|new message/i.test(String(value))) return;
                titleDescriptor.set.call(this, value);
              },
            });
          }

          var useTawkProxy =
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1";

          var rewriteTawkUrl = function (url) {
            if (!useTawkProxy || typeof url !== "string") return url;
            if (url.indexOf("https://embed.tawk.to/_s/") === 0) {
              return url.replace("https://embed.tawk.to/_s/", "/api/tawk/static/_s/");
            }
            if (url.indexOf("https://va.tawk.to/") === 0) {
              return url.replace("https://va.tawk.to/", "/api/tawk/va/");
            }
            return url;
          };

          var originalSetAttribute = Element.prototype.setAttribute;
          Element.prototype.setAttribute = function (name, value) {
            if (
              this.tagName === "SCRIPT" &&
              String(name).toLowerCase() === "crossorigin" &&
              String(value) === "*"
            ) {
              return;
            }
            if (
              useTawkProxy &&
              this.tagName === "SCRIPT" &&
              String(name).toLowerCase() === "src"
            ) {
              return originalSetAttribute.call(this, name, rewriteTawkUrl(String(value)));
            }
            if (
              useTawkProxy &&
              this.tagName === "LINK" &&
              String(name).toLowerCase() === "href"
            ) {
              return originalSetAttribute.call(this, name, rewriteTawkUrl(String(value)));
            }
            return originalSetAttribute.apply(this, arguments);
          };

          var descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "crossOrigin");
          if (descriptor && descriptor.set && descriptor.get) {
            Object.defineProperty(HTMLScriptElement.prototype, "crossOrigin", {
              configurable: true,
              enumerable: descriptor.enumerable,
              get: function () {
                return descriptor.get.call(this);
              },
              set: function (value) {
                if (String(value) === "*") return;
                descriptor.set.call(this, value);
              },
            });
          }

          if (useTawkProxy) {
            var srcDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
            if (srcDescriptor && srcDescriptor.set && srcDescriptor.get) {
              Object.defineProperty(HTMLScriptElement.prototype, "src", {
                configurable: true,
                enumerable: srcDescriptor.enumerable,
                get: function () {
                  return srcDescriptor.get.call(this);
                },
                set: function (value) {
                  srcDescriptor.set.call(this, rewriteTawkUrl(String(value)));
                },
              });
            }

            var linkHrefDescriptor = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, "href");
            if (linkHrefDescriptor && linkHrefDescriptor.set && linkHrefDescriptor.get) {
              Object.defineProperty(HTMLLinkElement.prototype, "href", {
                configurable: true,
                enumerable: linkHrefDescriptor.enumerable,
                get: function () {
                  return linkHrefDescriptor.get.call(this);
                },
                set: function (value) {
                  linkHrefDescriptor.set.call(this, rewriteTawkUrl(String(value)));
                },
              });
            }

            var originalFetch = window.fetch ? window.fetch.bind(window) : null;
            if (originalFetch) {
              window.fetch = function (input, init) {
                if (typeof input === "string") {
                  return originalFetch(rewriteTawkUrl(input), init);
                }
                if (input && input.url) {
                  var nextUrl = rewriteTawkUrl(input.url);
                  if (nextUrl !== input.url) {
                    return originalFetch(nextUrl, init);
                  }
                }
                return originalFetch(input, init);
              };
            }
          }
        })();
        (function () {
          var useTawkProxy =
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1";
          var s1 = document.createElement("script");
          var s0 = document.getElementsByTagName("script")[0];
          s1.async = true;
          s1.src = useTawkProxy
            ? "/api/tawk?propertyId=" + encodeURIComponent(${JSON.stringify(propertyId)}) + "&widgetId=" + encodeURIComponent(${JSON.stringify(widgetId)})
            : "https://embed.tawk.to/" + ${JSON.stringify(propertyId)} + "/" + ${JSON.stringify(widgetId)};
          s1.charset = "UTF-8";
          s0.parentNode.insertBefore(s1, s0);
        })();
      `}
    </Script>
  );
}