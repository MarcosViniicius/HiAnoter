import { useState, useRef, useEffect, useId, useMemo } from "react";
import { Check, ChevronDown, Plus, RefreshCw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  loading?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  id?: string;
  name?: string;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Selecione uma opção...",
  disabled = false,
  searchable = false,
  searchPlaceholder = "Buscar opção...",
  allowCustom = false,
  loading = false,
  onOpenChange,
  className,
  triggerClassName,
  dropdownClassName,
  id,
  name,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value);

  // Trigger onOpenChange callback
  const toggleOpen = (nextState?: boolean) => {
    const next = typeof nextState === "boolean" ? nextState : !isOpen;
    setIsOpen(next);
    if (next) {
      setSearchQuery("");
      onOpenChange?.(true);
    } else {
      onOpenChange?.(false);
    }
  };

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, searchable]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        toggleOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        toggleOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.description && opt.description.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q)),
    );
  }, [options, searchQuery]);

  const hasExactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return options.some((opt) => opt.value.toLowerCase() === q || opt.label.toLowerCase() === q);
  }, [options, searchQuery]);

  const handleSelect = (val: T) => {
    onChange(val);
    toggleOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", isOpen && "z-[60]", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => !disabled && toggleOpen()}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs text-ink transition-all",
          "hover:border-accent/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
          isOpen && "border-accent ring-1 ring-accent bg-surface",
          disabled && "opacity-50 cursor-not-allowed",
          triggerClassName,
        )}
      >
        <div className="flex items-center gap-2 truncate text-left">
          {selectedOption?.icon && (
            <span className="shrink-0 text-accent">{selectedOption.icon}</span>
          )}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : value ? value : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
              {selectedOption.badge}
            </span>
          )}
          {!selectedOption && value && (
            <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-accent">
              custom
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-accent" />}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-ink-faint transition-transform duration-200",
              isOpen && "rotate-180 text-accent",
            )}
          />
        </div>
      </button>

      {/* Floating Options Menu */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+4px)] z-[70] max-h-72 overflow-hidden rounded-2xl border border-line bg-surface shadow-depth animate-scale-up flex flex-col",
            dropdownClassName,
          )}
        >
          {/* Search Input Bar (when searchable is enabled) */}
          {searchable && (
            <div className="p-2 border-b border-line bg-surface2/40 shrink-0">
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-ink-faint pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (filteredOptions.length > 0) {
                        handleSelect(filteredOptions[0].value);
                      } else if (allowCustom && searchQuery.trim()) {
                        handleSelect(searchQuery.trim() as T);
                      }
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-xl border border-line bg-surface pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 text-ink-faint hover:text-ink p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 max-h-60">
            {/* Custom option button if allowCustom is on and query doesn't match */}
            {allowCustom && searchQuery.trim() && !hasExactMatch && (
              <button
                type="button"
                onClick={() => handleSelect(searchQuery.trim() as T)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-accent hover:bg-accent-soft/40 transition-colors text-left"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="truncate">
                  Usar modelo manual: <strong className="font-mono">{searchQuery.trim()}</strong>
                </span>
              </button>
            )}

            {filteredOptions.length === 0 && (!allowCustom || !searchQuery.trim()) && (
              <div className="py-6 text-center text-xs text-ink-faint">
                {loading ? "Buscando modelos da API..." : "Nenhum modelo encontrado."}
              </div>
            )}

            {filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs transition-colors text-left",
                    isSelected
                      ? "bg-accent text-white font-semibold shadow-soft"
                      : "text-ink hover:bg-surface2 hover:text-ink",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {opt.icon && (
                      <span className={cn("shrink-0", isSelected ? "text-white" : "text-accent")}>
                        {opt.icon}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{opt.label}</span>
                        {opt.badge && (
                          <span
                            className={cn(
                              "shrink-0 rounded px-1 py-0.2 font-mono text-[9.5px]",
                              isSelected
                                ? "bg-white/20 text-white"
                                : "bg-subtle text-ink-faint",
                            )}
                          >
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.description && (
                        <p
                          className={cn(
                            "text-[10px] truncate leading-tight mt-0.5",
                            isSelected ? "text-white/80" : "text-ink-faint",
                          )}
                        >
                          {opt.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
