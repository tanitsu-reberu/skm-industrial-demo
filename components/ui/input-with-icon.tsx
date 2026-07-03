"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type InputWithIconProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: LucideIcon;
  wrapperClassName?: string;
};

const InputWithIcon = React.forwardRef<HTMLInputElement, InputWithIconProps>(
  ({ icon: Icon, className, wrapperClassName, ...props }, ref) => {
    return (
      <div className={cn("relative min-w-0", wrapperClassName)}>
        <Icon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input ref={ref} className={cn("pl-11", className)} {...props} />
      </div>
    );
  },
);
InputWithIcon.displayName = "InputWithIcon";

export { InputWithIcon };