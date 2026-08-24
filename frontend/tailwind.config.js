/** @type {import('tailwindcss').Config} */
/* =====================================================================
 * HiNoter-Lite · design tokens (fonte única de verdade da interface)
 *
 * Direção: "papel quente + tinta + um único accent (teal profundo)".
 * Todas as cores neutras são tintadas de quente (nunca azul-acinzentado).
 * Sombras carregam o hue do fundo (tinta quente, não preto puro).
 * Motion centraliza: `animate-*` abaixo + `prefers-reduced-motion` em CSS.
 * ===================================================================== */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--bg-paper) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        surface2: "rgb(var(--bg-surface2) / <alpha-value>)",
        subtle: "rgb(var(--bg-subtle) / <alpha-value>)",
        line: "rgb(var(--border-line) / <alpha-value>)",
        line2: "rgb(var(--border-line2) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--text-ink) / <alpha-value>)",
          soft: "rgb(var(--text-ink-soft) / <alpha-value>)",
          faint: "rgb(var(--text-ink-faint) / <alpha-value>)",
          faint2: "rgb(var(--text-ink-faint2) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "#0D7266",
          deep: "#0A5B51",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          line: "rgb(var(--accent-line) / <alpha-value>)",
          onDark: "#6FD2C1",
        },
        night: {
          DEFAULT: "#1E1B15",
          soft: "#2B2720",
          text: "#ECE7DA",
          muted: "#A8A192",
          faint: "#74705F",
          line: "#3B362B",
        },
        warn: { fg: "#D97706", bg: "rgb(var(--bg-subtle) / <alpha-value>)", line: "rgb(var(--border-line) / <alpha-value>)" },
        danger: { fg: "#DC2626", bg: "rgb(var(--bg-subtle) / <alpha-value>)", line: "rgb(var(--border-line) / <alpha-value>)" },
        success: { fg: "#16A34A", bg: "rgb(var(--bg-subtle) / <alpha-value>)", line: "rgb(var(--border-line) / <alpha-value>)" },
      },
      fontFamily: {
        sans: [
          '"Instrument Sans Variable"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        serif: [
          '"Fraunces Variable"',
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
        mono: [
          '"JetBrains Mono Variable"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        soft: "0 1px 2px rgb(29 26 21 / 0.05), 0 4px 14px -4px rgb(29 26 21 / 0.10)",
        raise: "0 2px 4px rgb(29 26 21 / 0.05), 0 14px 32px -12px rgb(29 26 21 / 0.20)",
        depth: "0 28px 56px -28px rgb(20 18 13 / 0.35)",
        insetline: "inset 0 0 0 1px rgb(29 26 21 / 0.06)",
      },
      animation: {
        "fade-up": "fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fadeIn 0.3s ease-out both",
        wave: "wave 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.9s linear infinite",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        wave: {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      zIndex: {
        grain: "5",
        sticky: "40",
      },
    },
  },
  plugins: [],
};