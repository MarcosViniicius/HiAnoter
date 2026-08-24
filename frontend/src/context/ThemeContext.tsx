import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Theme = "system" | "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "hinoter_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return saved === "dark" || saved === "light" || saved === "system" ? saved : "system";
  });

  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // Escuta mudancas no sistema operacional
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const resolvedTheme: "dark" | "light" = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // Atualiza classes do DOM
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    }
  }, [resolvedTheme]);

  // Sincroniza tema inicial do backend se disponivel
  useEffect(() => {
    let active = true;
    api.settings()
      .then((data: import("@/types").SettingsResponse) => {
        if (!active) return;
        const themeItem = data.settings?.find((s) => s.key === "theme");
        if (themeItem && themeItem.value && (themeItem.value === "dark" || themeItem.value === "light" || themeItem.value === "system")) {
          const local = localStorage.getItem(STORAGE_KEY);
          if (!local) {
            setThemeState(themeItem.value as Theme);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
      // Salva no backend de forma transparente
      void api.updateSettings({ theme: newTheme }).catch(() => undefined);
    } catch {}
  };

  const toggleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
