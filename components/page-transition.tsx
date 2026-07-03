import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-[calc(100vh-4rem)]", className)}>{children}</div>;
}