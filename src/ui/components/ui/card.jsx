import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-xl border text-[color:var(--text)] shadow-sm transition-colors duration-200",
  {
    variants: {
      variant: {
        primary: "border-[color:rgba(10,132,255,.52)] bg-[linear-gradient(175deg,rgba(10,132,255,.2),rgba(10,132,255,.06)_55%,rgba(255,255,255,.02))] shadow-[0_14px_36px_rgba(10,132,255,.24)]",
        secondary: "border-[color:var(--hairline)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] shadow-[0_6px_20px_rgba(0,0,0,.28)]",
        utility: "border-[color:rgba(255,255,255,.08)] bg-[color:rgba(255,255,255,0.02)] shadow-none",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
);

const Card = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-base font-semibold leading-tight tracking-tight text-[color:var(--text)]", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-[color:var(--text-muted)]", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
