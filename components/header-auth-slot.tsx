"use client";

import { useEffect, useState, type ComponentType } from "react";
import { HeaderAuthPlaceholder } from "@/components/header-auth-placeholder";

export function HeaderAuthSlot() {
  const [Controls, setControls] = useState<ComponentType | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    let active = true;
    let loading = false;

    function loadControls() {
      if (!media.matches || loading) return;
      loading = true;
      void import("@/components/header-session-controls")
        .then((module) => {
          if (active) setControls(() => module.HeaderSessionControls);
        })
        .catch(() => {
          loading = false;
        });
    }

    loadControls();
    if (media.addEventListener) media.addEventListener("change", loadControls);
    else media.addListener(loadControls);

    return () => {
      active = false;
      if (media.removeEventListener) media.removeEventListener("change", loadControls);
      else media.removeListener(loadControls);
    };
  }, []);

  return Controls ? <Controls /> : <HeaderAuthPlaceholder />;
}
