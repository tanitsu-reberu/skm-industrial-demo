import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "focus-ring smooth-input flex h-12 w-full min-w-0 rounded-md border border-border bg-[#121212] py-3 ps-4 pe-4 text-base text-white placeholder:text-muted hover:border-[#3f3f46] sm:h-11 sm:py-2 sm:ps-3 sm:pe-3 sm:text-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
