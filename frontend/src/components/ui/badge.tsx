import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider shadow-xs",
  {
    variants: {
      variant: {
        neutral: "border-line bg-subtle/80 text-ink-soft",
        accent: "border-accent/30 bg-accent-soft text-accent-deep font-bold",
        success: "border-success-line bg-success-bg text-success-fg font-bold",
        danger: "border-danger-line bg-danger-bg text-danger-fg font-bold",
        warn: "border-warn-line bg-warn-bg text-warn-fg font-bold",
        inverted: "border-night-line bg-night-soft text-night-muted",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
}

function Badge({ className, variant, dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };