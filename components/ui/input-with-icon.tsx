"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type InputWithIconProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: LucideIcon;
  wrapperClassName?: string;
};

const ICON_SLOT_WIDTH = "w-11";

const InputWithIcon = React.forwardRef<HTMLInputElement, InputWithIconProps>(
  ({ icon: Icon, className, wrapperClassName, ...props }, ref) => {
    return (
      <div className={cn("relative isolate min-w-0", wrapperClassName)}>
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center justify-center text-muted",
            ICON_SLOT_WIDTH,
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4 shrink-0" />
        </div>
        <Input ref={ref} className={cn("ps-11 sm:ps-11", className)} {...props} />
      </div>
    );
  },
);
InputWithIcon.displayName = "InputWithIcon";

export { InputWithIcon };