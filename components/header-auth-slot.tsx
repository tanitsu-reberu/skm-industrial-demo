"use client";

import dynamic from "next/dynamic";
import { HeaderAuthPlaceholder } from "@/components/header-auth-placeholder";

const HeaderSessionControls = dynamic(
  () => import("@/components/header-session-controls").then((mod) => mod.HeaderSessionControls),
  {
    ssr: false,
    loading: () => <HeaderAuthPlaceholder />,
  },
);

export function HeaderAuthSlot() {
  return <HeaderSessionControls />;
}