import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-8 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-insetline">
          {icon}
        </div>
      )}
      <div className="max-w-sm space-y-1.5">
        <h3 className="font-serif text-lg font-semibold tracking-tight text-ink">{title}</h3>
        {description && (
          <p className="text-[14px] leading-relaxed text-ink-faint">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}