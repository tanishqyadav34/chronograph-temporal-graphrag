import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "chrono-bg": "rgb(var(--chrono-bg) / <alpha-value>)",
        "chrono-bg-secondary": "rgb(var(--chrono-bg-secondary) / <alpha-value>)",
        "chrono-surface": "rgb(var(--chrono-surface) / <alpha-value>)",
        "chrono-surface-light": "rgb(var(--chrono-surface-light) / <alpha-value>)",
        "chrono-border": "var(--chrono-border)",
        "chrono-primary": "rgb(var(--chrono-primary) / <alpha-value>)",
        "chrono-primary-hover": "rgb(var(--chrono-primary-hover) / <alpha-value>)",
        "chrono-violet": "rgb(var(--chrono-violet) / <alpha-value>)",
        "chrono-cyan": "rgb(var(--chrono-cyan) / <alpha-value>)",
        "chrono-green": "rgb(var(--chrono-green) / <alpha-value>)",
        "chrono-text": "rgb(var(--chrono-text) / <alpha-value>)",
        "chrono-text-muted": "rgb(var(--chrono-text-muted) / <alpha-value>)",
        "chrono-text-dim": "rgb(var(--chrono-text-dim) / <alpha-value>)",
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
