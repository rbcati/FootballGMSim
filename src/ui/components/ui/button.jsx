import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-h-[44px]",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] active:scale-[0.98]",
        destructive:
          "bg-[color:var(--danger)] text-white hover:opacity-90 active:scale-[0.98]",
        outline:
          "border border-[color:var(--hairline)] bg-transparent text-[color:var(--text)] hover:bg-[color:var(--surface-strong)]",
        secondary:
          "bg-[color:var(--surface-strong)] text-[color:var(--text)] hover:bg-[color:var(--surface-elevated)]",
        ghost:
          "text-[color:var(--text)] hover:bg-[color:var(--surface-strong)]",
        link: "text-[color:var(--accent)] underline-offset-4 hover:underline",
        success:
          "bg-[color:var(--success)] text-white hover:opacity-90 active:scale-[0.98]",
        warning:
          "bg-[color:var(--warning)] text-black hover:opacity-90 active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
