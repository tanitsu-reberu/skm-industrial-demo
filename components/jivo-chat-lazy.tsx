"use client";

import dynamic from "next/dynamic";

const JivoChat = dynamic(
  () => import("@/components/jivo-chat").then((mod) => mod.JivoChat),
  { ssr: false },
);

type JivoChatLazyProps = {
  widgetId: string;
  authOnly?: boolean;
};

export function JivoChatLazy({ widgetId, authOnly }: JivoChatLazyProps) {
  return <JivoChat widgetId={widgetId} authOnly={authOnly} />;
}