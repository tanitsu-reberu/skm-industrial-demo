import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AnimatedSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return <section className={cn("content-visibility-auto py-16 sm:py-20", className)}>{children}</section>;
}
