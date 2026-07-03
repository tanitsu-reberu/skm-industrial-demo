"use client";

import Script from "next/script";
import { useEffect } from "react";
import { tawkIframeBrandCss, tawkPageBrandCss } from "@/lib/tawk-brand";
import { applyTawkRussianText } from "@/lib/tawk-russian";

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
      onLoad?: () => void;
      visitor?: TawkVisitor;
      setAttributes?: (
        attributes: Record<string, string>,
        callback?: (error: Error | null) => void,
      ) => void;
      hideWidget?: () => void;
      showWidget?: () => void;
      customStyle?: {
        zIndex?: number | string;
      };
    };
    Tawk_LoadStart?: Date;
  }
}

const PAGE_STYLE_ID = "skm-tawk-page-brand";
const IFRAME_STYLE_ID = "skm-tawk-iframe-brand";

function ensurePageBrandStyles() {
  if (document.getElementById(PAGE_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = tawkPageBrandCss;
  document.head.appendChild(style);
}

function localizeIframe(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;

    if (!doc.getElementById(IFRAME_STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = IFRAME_STYLE_ID;
      style.textContent = tawkIframeBrandCss;
      (doc.head ?? doc.documentElement).appendChild(style);
    }

    applyTawkRussianText(doc.body ?? doc.documentElement);
  } catch {
    // iframe ещё не готов
  }
}

function scanTawkIframes() {
  document.querySelectorAll("iframe[title*='chat' i]").forEach((node) => {
    localizeIframe(node as HTMLIFrameElement);
  });
}

export function TawkToChat({
  propertyId,
  widgetId,
  visitor = null,
  authOnly = false,
  isAuthenticated = false,
}: TawkToChatProps) {
  const embedSrc = `https://embed.tawk.to/${propertyId}/${widgetId}`;
  const shouldShowWidget = !authOnly || isAuthenticated;

  useEffect(() => {
    ensurePageBrandStyles();

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_API.customStyle = { zIndex: 9990 };

    const previousOnLoad = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = function onLoad() {
      previousOnLoad?.();
      ensurePageBrandStyles();
      scanTawkIframes();

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

    const observer = new MutationObserver(() => {
      ensurePageBrandStyles();
      scanTawkIframes();
    });

    const localizeTimer = window.setInterval(scanTawkIframes, 1500);

    observer.observe(document.body, { childList: true, subtree: true });
    scanTawkIframes();

    return () => {
      observer.disconnect();
      window.clearInterval(localizeTimer);
    };
  }, [shouldShowWidget, visitor?.email, visitor?.name]);

  const visitorInit = visitor
    ? `window.Tawk_API.visitor = { name: ${JSON.stringify(visitor.name)}, email: ${JSON.stringify(visitor.email)} };`
    : "";

  return (
    <Script id="tawk-embed" strategy="lazyOnload">
      {`
        window.Tawk_API = window.Tawk_API || {};
        window.Tawk_LoadStart = new Date();
        window.Tawk_API.customStyle = { zIndex: 9990 };
        ${visitorInit}
        (function () {
          var s1 = document.createElement("script");
          var s0 = document.getElementsByTagName("script")[0];
          s1.async = true;
          s1.src = ${JSON.stringify(embedSrc)};
          s1.charset = "UTF-8";
          s1.setAttribute("crossorigin", "*");
          s0.parentNode.insertBefore(s1, s0);
        })();
      `}
    </Script>
  );
}