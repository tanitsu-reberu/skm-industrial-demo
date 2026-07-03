import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "focus-ring flex h-12 w-full rounded-md border border-border bg-[#121212] px-4 py-3 text-base text-white placeholder:text-muted transition-colors hover:border-[#3f3f46] sm:h-11 sm:px-3 sm:py-2 sm:text-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
