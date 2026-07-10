"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { buildJivoBootScript, jivoPageCss } from "@/lib/jivo-brand";

type JivoChatRuntimeProps = {
  widgetId: string;
  authOnly?: boolean;
};

const PAGE_STYLE_ID = "skm-jivo-page-brand";
const OPEN_EVENT = "skm:open-chat";

function ensurePageStyles() {
  if (document.getElementById(PAGE_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = jivoPageCss;
  document.head.appendChild(style);
}

function openJivoIfReady() {
  if (!window.jivo_api?.open) return false;

  try {
    window.jivo_api.open({ start: "chat" });
    return true;
  } catch {
    return false;
  }
}

async function canOpenAuthOnlyChat() {
  const response = await fetch("/api/session", {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) return false;
  const session = (await response.json()) as { user?: { email: string } | null };
  return Boolean(session.user);
}

export function JivoChatRuntime({ widgetId, authOnly = false }: JivoChatRuntimeProps) {
  const [shouldLoad, setShouldLoad] = useState(false);

  async function requestOpen() {
    if (authOnly && !(await canOpenAuthOnlyChat())) {
      window.location.href = "/login";
      return;
    }

    ensurePageStyles();
    window.__skmPendingJivoOpen = true;

    if (openJivoIfReady()) {
      window.__skmPendingJivoOpen = false;
      return;
    }

    setShouldLoad(true);
  }

  useEffect(() => {
    function onOpenRequest() {
      void requestOpen();
    }

    window.addEventListener(OPEN_EVENT, onOpenRequest);
    void requestOpen();
    return () => window.removeEventListener(OPEN_EVENT, onOpenRequest);
    // authOnly is intentionally captured from the mounted runtime instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authOnly]);

  useEffect(() => {
    if (!shouldLoad) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (openJivoIfReady()) {
        window.__skmPendingJivoOpen = false;
        window.clearInterval(timer);
      }

      if (attempts >= 30) window.clearInterval(timer);
    }, 300);

    return () => window.clearInterval(timer);
  }, [shouldLoad]);

  if (!shouldLoad) return null;

  return (
    <>
      <Script id="jivo-locale" strategy="afterInteractive">
        {`window.jivo_config = Object.assign({}, window.jivo_config || {}, { lang: "ru" });`}
      </Script>
      <Script id="jivo-brand-boot" strategy="afterInteractive">
        {buildJivoBootScript()}
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
