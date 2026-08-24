import React, { createContext, useCallback, useContext, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info" | "warning" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: {
    success: (title: string, opts?: { description?: string; duration?: number; action?: ToastAction }) => string;
    error: (title: string, opts?: { description?: string; duration?: number; action?: ToastAction }) => string;
    info: (title: string, opts?: { description?: string; duration?: number; action?: ToastAction }) => string;
    warning: (title: string, opts?: { description?: string; duration?: number; action?: ToastAction }) => string;
    loading: (title: string, opts?: { description?: string }) => string;
    dismiss: (id: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx.toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (
      type: ToastType,
      title: string,
      opts?: { description?: string; duration?: number; action?: ToastAction },
    ) => {
      const id = Math.random().toString(36).slice(2, 9);
      const item: ToastItem = {
        id,
        type,
        title,
        description: opts?.description,
        duration: opts?.duration ?? (type === "error" ? 6000 : type === "loading" ? 0 : 4000),
        action: opts?.action,
      };

      setToasts((prev) => [...prev.slice(-4), item]);

      if (item.duration && item.duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, item.duration);
      }

      return id;
    },
    [dismiss],
  );

  const toastMethods = {
    success: (title: string, opts?: { description?: string; duration?: number; action?: ToastAction }) =>
      addToast("success", title, opts),
    error: (title: string, opts?: { description?: string; duration?: number; action?: ToastAction }) =>
      addToast("error", title, opts),
    info: (title: string, opts?: { description?: string; duration?: number; action?: ToastAction }) =>
      addToast("info", title, opts),
    warning: (title: string, opts?: { description?: string; duration?: number; action?: ToastAction }) =>
      addToast("warning", title, opts),
    loading: (title: string, opts?: { description?: string }) =>
      addToast("loading", title, opts),
    dismiss,
  };

  return (
    <ToastContext.Provider value={{ toast: toastMethods }}>
      {children}
      {/* Toast Container */}
      <div
        aria-live="polite"
        aria-label="Notificações"
        className="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const getIcon = () => {
    switch (item.type) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-danger-fg shrink-0" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />;
      case "loading":
        return <Loader2 className="h-5 w-5 text-accent animate-spin shrink-0" />;
      case "info":
      default:
        return <Info className="h-5 w-5 text-accent shrink-0" />;
    }
  };

  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-2xl border bg-surface/95 p-4 shadow-depth backdrop-blur-md transition-all animate-slide-up",
        item.type === "success" && "border-emerald-500/30 bg-emerald-500/5",
        item.type === "error" && "border-danger-line bg-danger-bg/90",
        item.type === "warning" && "border-amber-500/30 bg-amber-500/5",
        item.type === "info" && "border-accent/30 bg-accent-soft/40",
        item.type === "loading" && "border-accent/40 bg-surface/95",
      )}
    >
      <div className="mt-0.5">{getIcon()}</div>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs sm:text-[13px] font-bold text-ink leading-snug">
          {item.title}
        </p>
        {item.description && (
          <p className="text-[11px] sm:text-xs text-ink-soft leading-relaxed">
            {item.description}
          </p>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
            className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-soft hover:bg-accent-deep active:scale-95 transition-all"
          >
            <span>{item.action.label}</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="rounded-lg p-1 text-ink-faint hover:bg-subtle hover:text-ink transition-colors"
        aria-label="Fechar notificação"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
