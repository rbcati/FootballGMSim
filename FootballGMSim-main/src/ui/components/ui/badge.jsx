import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[color:var(--accent)] text-white",
        secondary:
          "border-transparent bg-[color:var(--surface-strong)] text-[color:var(--text-muted)]",
        destructive:
          "border-transparent bg-[color:var(--danger)] text-white",
        outline:
          "border-[color:var(--hairline)] text-[color:var(--text)]",
        success:
          "border-transparent bg-[color:var(--success)] text-white",
        warning:
          "border-transparent bg-[color:var(--warning)] text-black",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
