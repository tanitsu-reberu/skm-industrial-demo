"use client";

import Script from "next/script";
import { useEffect } from "react";

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
    };
    Tawk_LoadStart?: Date;
  }
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
    window.Tawk_API = window.Tawk_API || {};

    const previousOnLoad = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = function onLoad() {
      previousOnLoad?.();

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
  }, [shouldShowWidget, visitor?.email, visitor?.name]);

  const visitorInit = visitor
    ? `window.Tawk_API.visitor = { name: ${JSON.stringify(visitor.name)}, email: ${JSON.stringify(visitor.email)} };`
    : "";

  return (
    <Script id="tawk-embed" strategy="lazyOnload">
      {`
        window.Tawk_API = window.Tawk_API || {};
        window.Tawk_LoadStart = new Date();
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