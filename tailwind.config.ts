import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "chrono-bg": "#0a0e17",
        "chrono-bg-secondary": "#0d1220",
        "chrono-surface": "#111827",
        "chrono-surface-light": "#151b2b",
        "chrono-border": "rgba(99, 102, 241, 0.12)",
        "chrono-primary": "#6366f1",
        "chrono-primary-hover": "#5558e6",
        "chrono-violet": "#8b5cf6",
        "chrono-cyan": "#22d3ee",
        "chrono-green": "#22c55e",
        "chrono-text": "#e5e7eb",
        "chrono-text-muted": "#8b94a7",
        "chrono-text-dim": "#5c6479",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
