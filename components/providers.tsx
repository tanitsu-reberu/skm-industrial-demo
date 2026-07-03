"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [enableSmoothScroll, setEnableSmoothScroll] = useState(false);

  useEffect(() => {
    setEnableSmoothScroll(true);
  }, []);

  if (!enableSmoothScroll) {
    return <>{children}</>;
  }

  return (
    <ReactLenis root options={{ lerp: 0.09, duration: 1.15, smoothWheel: true, syncTouch: false }}>
      {children}
    </ReactLenis>
  );
}
