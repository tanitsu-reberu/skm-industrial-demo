"use client";

import dynamic from "next/dynamic";

const HeaderSessionControls = dynamic(
  () => import("@/components/header-session-controls").then((mod) => mod.HeaderSessionControls),
  {
    ssr: false,
    loading: () => <div className="hidden h-11 w-24 shrink-0 lg:block" aria-hidden />,
  },
);

export function HeaderAuthSlot() {
  return <HeaderSessionControls />;
}