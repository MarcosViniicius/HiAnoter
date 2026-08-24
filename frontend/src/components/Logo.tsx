import { cn } from "@/lib/utils";

export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-9 w-9", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" className="fill-night" />
      <g stroke="#ECE7DA" strokeWidth="2.4" strokeLinecap="round">
        <path d="M10 20V12" opacity="0.55" />
        <path d="M16 21V11" opacity="0.9" />
        <path d="M22 19V13" opacity="0.7" />
      </g>
      <circle cx="25" cy="7" r="3" className="fill-accent" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-serif text-lg font-semibold tracking-tight">HiaNoter</span>
      <span className="rounded border border-current/20 px-1 py-px text-[9px] font-semibold uppercase tracking-[0.14em] text-inherit/70">
        Lite
      </span>
    </span>
  );
}