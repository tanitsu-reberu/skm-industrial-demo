"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JivoChatLazy } from "@/components/jivo-chat-lazy";

const KEY = "skm_cookie_preferences_v1";
type Choice = "all" | "necessary";

export function CookieConsent({ widgetId, authOnly }: { widgetId?: string; authOnly?: boolean }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    setChoice(saved === "all" || saved === "necessary" ? saved : null);
    setReady(true);
  }, []);

  function choose(value: Choice) {
    window.localStorage.setItem(KEY, value);
    setChoice(value);
  }

  return (
    <>
      {ready && choice === "all" && widgetId ? <JivoChatLazy widgetId={widgetId} authOnly={Boolean(authOnly)} /> : null}
      {ready && !choice ? (
        <section aria-label="Настройки cookie" className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] rounded-lg border border-border bg-card p-4 shadow-2xl md:inset-x-auto md:bottom-5 md:left-5 md:max-w-xl">
          <h2 className="font-display text-lg font-semibold text-white">Настройки cookie</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Необходимые cookie обеспечивают вход и работу сайта. JivoSite загружается только с вашего разрешения и может обрабатывать технические данные. Подробнее — в <Link href="/politika" className="text-primary underline underline-offset-4">политике</Link>.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => choose("all")}>Разрешить все</Button>
            <Button variant="secondary" onClick={() => choose("necessary")}>Только необходимые</Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
