import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Seções da gravação"
      className={cn(
        "flex items-center gap-1 sm:gap-1.5 rounded-2xl border border-line bg-surface/90 p-1 sm:p-1.5 shadow-soft backdrop-blur-md overflow-x-auto no-scrollbar touch-pan-x",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex shrink-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 min-h-[40px] sm:min-h-[44px] text-xs sm:text-[13px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 touch-tap whitespace-nowrap active:scale-[0.98]",
              active
                ? "bg-accent text-white shadow-soft"
                : "text-ink-soft hover:bg-subtle/80 hover:text-ink",
            )}
          >
            <span className={cn("transition-colors shrink-0", active ? "text-white" : "text-ink-faint")}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}