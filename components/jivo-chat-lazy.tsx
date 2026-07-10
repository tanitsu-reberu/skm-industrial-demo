"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const JivoChat = dynamic(
  () => import("@/components/jivo-chat").then((mod) => mod.JivoChat),
  { ssr: false },
);

type JivoChatLazyProps = {
  widgetId: string;
  authOnly?: boolean;
};

export function JivoChatLazy({ widgetId, authOnly }: JivoChatLazyProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const timeout = isTouch ? 12000 : 6000;

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(() => setReady(true), { timeout });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timerId = globalThis.setTimeout(() => setReady(true), isTouch ? 8000 : 4000);
    return () => globalThis.clearTimeout(timerId);
  }, []);

  if (!ready) return null;
  return <JivoChat widgetId={widgetId} authOnly={authOnly} />;
}