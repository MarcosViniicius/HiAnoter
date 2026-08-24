import { Laptop, Moon, Palette, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

export function AppearanceConfigCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const { theme, setTheme } = useTheme();

  const current = (values["theme"] || theme || "system") as Theme;

  const handleSelect = (t: Theme) => {
    setTheme(t);
    onChange("theme", t);
  };

  const options: Array<{
    id: Theme;
    title: string;
    description: string;
    icon: typeof Sun;
  }> = [
    {
      id: "light",
      title: "Claro",
      description: "Papel aquecido e leitura confortável",
      icon: Sun,
    },
    {
      id: "dark",
      title: "Escuro",
      description: "Tons profundos e contraste suave à noite",
      icon: Moon,
    },
    {
      id: "system",
      title: "Sistema",
      description: "Segue automaticamente o tema do seu dispositivo",
      icon: Laptop,
    },
  ];

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-soft space-y-4">
      {/* Header do Card */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-line">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
          <Palette className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-ink flex items-center gap-1.5">
            <span>Aparência & Tema</span>
            <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-accent">
              UI
            </span>
          </h3>
          <p className="text-[11px] text-ink-soft">
            Personalize a paleta de cores entre modo claro, escuro ou sincronizado com o sistema.
          </p>
        </div>
      </div>

      {/* Opções de Tema */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = current === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt.id)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all touch-tap",
                isSelected
                  ? "border-accent bg-accent-soft/50 ring-1 ring-accent text-ink shadow-sm"
                  : "border-line bg-surface2/50 text-ink-soft hover:bg-surface2 hover:border-line2 hover:text-ink",
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    isSelected ? "bg-accent text-white" : "bg-subtle text-ink-soft",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {isSelected && (
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                )}
              </div>
              <div>
                <span className="text-xs font-bold text-ink block">{opt.title}</span>
                <span className="text-[10.5px] text-ink-faint leading-tight block mt-0.5">
                  {opt.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
