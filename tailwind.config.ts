import type { Config } from "tailwindcss"

/**
 * Colour is routed through the appearance tokens in app/globals.css.
 *
 * The brand hexes stay available under their old names for the places that
 * mean the literal colour (a teal button, linen text on it). The mapping
 * below is per channel on purpose: `bg-white` means "the card surface" and
 * follows the theme, while `text-white` on a teal button stays white. Same
 * for `text-tk-slate` (body ink, follows the theme) versus `bg-tk-slate`
 * (a slate chip, literal). This is what gives every existing page dark mode
 * without touching it.
 */
const rgb = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "tk-teal": "#006965",
        "tk-tomato": "#B72A0F",
        "tk-linen": "#F1EADC",
        "tk-slate": "#1F2C2B",
        "tk-onyx": "#0F1615",
        canvas: rgb("canvas"),
        card: rgb("card"),
        well: rgb("well"),
        line: rgb("line"),
        ink: rgb("ink"),
        "ink-2": rgb("ink-2"),
        "ink-3": rgb("ink-3"),
        accent: rgb("accent"),
        "accent-ink": rgb("accent-ink"),
        "on-accent": rgb("on-accent"),
        bad: rgb("bad"),
        warn: rgb("warn"),
        ok: rgb("ok"),
        rail: rgb("rail"),
        "rail-2": rgb("rail-2"),
        "rail-ink": rgb("rail-ink"),
      },
      backgroundColor: {
        white: rgb("card"),
        "tk-linen": rgb("well"),
        "tk-teal": rgb("accent"),
        "amber-50": "rgb(var(--warn-rgb) / 0.09)",
        "amber-100": "rgb(var(--warn-rgb) / 0.14)",
        "red-50": "rgb(var(--bad-rgb) / 0.08)",
        "emerald-50": "rgb(var(--ok-rgb) / 0.08)",
        "emerald-100": "rgb(var(--ok-rgb) / 0.12)",
      },
      textColor: {
        "tk-onyx": rgb("ink"),
        "tk-slate": rgb("ink-2"),
        "tk-teal": rgb("accent-ink"),
        "red-700": rgb("bad"),
        "red-800": rgb("bad"),
        "amber-700": rgb("warn"),
        "amber-800": rgb("warn"),
        "amber-900": rgb("warn"),
        "emerald-700": rgb("ok"),
        "emerald-800": rgb("ok"),
      },
      borderColor: {
        white: rgb("card"),
        "tk-slate": rgb("line"),
        "tk-teal": rgb("accent-ink"),
        "tk-onyx": rgb("ink"),
      },
      divideColor: {
        "tk-slate": rgb("line"),
        "tk-linen": rgb("line"),
      },
      ringColor: {
        "tk-slate": rgb("line"),
        "tk-teal": rgb("accent-ink"),
      },
      placeholderColor: {
        "tk-slate": rgb("ink-3"),
      },
      boxShadow: {
        card: "var(--shadow-card)",
        hover: "var(--shadow-hover)",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: ["var(--font-inter-tight)", "var(--font-inter)", "system-ui", "sans-serif"],
        ui: ["var(--font-jakarta)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}

export default config
