"use client";

import { MessageCircle } from "lucide-react";
import { useState, type ComponentType } from "react";

type JivoChatProps = {
  widgetId: string;
  authOnly?: boolean;
};

type JivoRuntimeComponent = ComponentType<JivoChatProps>;

const OPEN_EVENT = "skm:open-chat";

export function JivoChat({ widgetId, authOnly = false }: JivoChatProps) {
  const [Runtime, setRuntime] = useState<JivoRuntimeComponent | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function requestOpen() {
    if (Runtime) {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT));
      return;
    }

    if (isLoading) return;
    setIsLoading(true);

    try {
      const runtimeModule = await import("@/components/jivo-chat-runtime");
      setRuntime(() => runtimeModule.JivoChatRuntime);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void requestOpen()}
        className="safe-floating focus-ring smooth-button fixed z-[9980] inline-flex h-14 min-h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-white shadow-red hover:bg-[#ff1624] active:scale-95"
        aria-label={isLoading ? "Чат загружается" : "Открыть чат"}
        aria-busy={isLoading}
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {Runtime ? <Runtime widgetId={widgetId} authOnly={authOnly} /> : null}
    </>
  );
}

export { OPEN_EVENT as JIVO_OPEN_EVENT };
