"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { buildJivoBootScript, jivoPageCss } from "@/lib/jivo-brand";
import { buildJivoRussianBootScript, localizeJivoWidget } from "@/lib/jivo-russian";

type JivoVisitor = {
  name: string;
  email: string;
};

type JivoChatProps = {
  widgetId: string;
  visitor?: JivoVisitor | null;
  /** Если true — виджет скрыт для гостей. См. NEXT_PUBLIC_JIVO_AUTH_ONLY в .env */
  authOnly?: boolean;
  isAuthenticated?: boolean;
};

const PAGE_STYLE_ID = "skm-jivo-page-brand";

function ensurePageStyles() {
  if (document.getElementById(PAGE_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = jivoPageCss;
  document.head.appendChild(style);
}

function syncJivoPage() {
  ensurePageStyles();
  window.__skmJivoApplyBrand?.();
  window.__skmLocalizeJivo?.();
  localizeJivoWidget();

  if (window.jivo_api?.sendPageTitle) {
    window.jivo_api.sendPageTitle(document.title, true, window.location.href);
  }
}

export function JivoChat({
  widgetId,
  visitor = null,
  authOnly = false,
  isAuthenticated = false,
}: JivoChatProps) {
  const pathname = usePathname();
  const shouldShowWidget = !authOnly || isAuthenticated;
  const brandBootScript = buildJivoBootScript({ visitor });
  const russianBootScript = buildJivoRussianBootScript();

  useEffect(() => {
    if (!shouldShowWidget) return;

    syncJivoPage();

    const onPageShow = () => syncJivoPage();
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onPageShow);

    const localizeTimer = window.setInterval(syncJivoPage, 1500);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onPageShow);
      window.clearInterval(localizeTimer);
    };
  }, [pathname, shouldShowWidget, visitor?.email, visitor?.name]);

  if (!shouldShowWidget) {
    return null;
  }

  return (
    <>
      <Script id="jivo-brand-boot" strategy="afterInteractive">
        {brandBootScript}
      </Script>
      <Script id="jivo-russian-boot" strategy="afterInteractive">
        {russianBootScript}
      </Script>
      <Script
        id="jivo-widget"
        src={`https://code.jivo.ru/widget/${widgetId}`}
        strategy="afterInteractive"
        async
      />
    </>
  );
}