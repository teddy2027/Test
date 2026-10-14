import type { Config } from "tailwindcss";

/** All colors resolve to CSS variables defined in src/app/globals.css (design tokens). */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        subtle: v("subtle"),
        line: v("line"),
        "line-strong": v("line-strong"),
        ink: v("ink"),
        "ink-2": v("ink-2"),
        muted: v("muted"),
        faint: v("faint"),
        brand: { DEFAULT: v("brand"), strong: v("brand-strong"), soft: v("brand-soft"), ink: v("brand-ink") },
        side: { DEFAULT: v("side"), line: v("side-line"), ink: v("side-ink"), muted: v("side-muted"), active: v("side-active") },
        pos: { DEFAULT: v("pos"), soft: v("pos-soft") },
        neg: { DEFAULT: v("neg"), soft: v("neg-soft") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") },
        info: { DEFAULT: v("info"), soft: v("info-soft") },
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["10.5px", "14px"],
        xs: ["11.5px", "16px"],
        sm: ["13px", "19px"],
        base: ["14px", "21px"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 1px rgba(16, 24, 40, 0.02)",
        pop: "0 10px 30px -10px rgba(16, 24, 40, 0.25), 0 2px 6px rgba(16, 24, 40, 0.06)",
      },
      borderRadius: { md: "6px", lg: "8px", xl: "10px" },
    },
  },
  plugins: [],
};
export default config;
