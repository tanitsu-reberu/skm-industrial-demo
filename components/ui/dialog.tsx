"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/72 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content asChild {...props}>
        <div className="group pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:items-center sm:p-4">
          <div
            className={cn(
              "pointer-events-auto relative max-h-[90svh] w-full overflow-y-auto rounded-t-lg border border-border bg-card p-5 shadow-2xl duration-200 group-data-[state=closed]:animate-out group-data-[state=open]:animate-in group-data-[state=closed]:slide-out-to-bottom-4 group-data-[state=open]:slide-in-from-bottom-4 sm:max-w-xl sm:rounded-lg sm:p-6 sm:group-data-[state=closed]:zoom-out-95 sm:group-data-[state=open]:zoom-in-95",
              className,
            )}
          >
            {children}
            <DialogPrimitive.Close className="focus-ring absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-white sm:right-4 sm:top-4 sm:h-9 sm:w-9">
              <X className="h-5 w-5" />
              <span className="sr-only">Закрыть</span>
            </DialogPrimitive.Close>
          </div>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-5 space-y-2 pr-10", className)} {...props} />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-2xl font-semibold leading-tight text-white", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-base leading-7 text-muted sm:text-sm sm:leading-6", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";

export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger };
