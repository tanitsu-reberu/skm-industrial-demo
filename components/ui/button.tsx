import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "focus-ring smooth-button inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-white shadow-red hover:bg-[#ff1624]",
        secondary: "border border-border bg-card text-white hover:border-primary/70 hover:bg-[#1f1f23]",
        ghost: "text-muted hover:bg-card hover:text-white",
        outline: "border border-border bg-transparent text-white hover:border-primary hover:text-white",
      },
      size: {
        default: "h-12 px-5 text-base sm:h-11 sm:text-sm",
        sm: "h-11 px-4 text-sm sm:h-10 sm:px-3",
        lg: "h-14 px-6 text-base sm:h-12",
        xl: "h-14 px-7 text-base",
        icon: "h-12 w-12 px-0 sm:h-11 sm:w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };