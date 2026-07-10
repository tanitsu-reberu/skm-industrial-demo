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
  return <section className={cn("tablet-section py-12 md:py-16 lg:py-20", className)}>{children}</section>;
}
