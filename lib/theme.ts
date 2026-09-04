/**
 * Appearance: light, dark, or follow the system.
 *
 * One cookie (`tk_theme`) on this browser. The admin layout reads it and
 * stamps `data-theme` on <html> from an inline script before hydration, so
 * the first paint is already the right theme — the same trick demo mode uses
 * for money (`lib/money-privacy.ts`). "system" stamps nothing and lets the
 * `prefers-color-scheme` media query in globals.css decide.
 *
 * No imports: safe in client bundles and scripts.
 */

export const THEME_COOKIE = "tk_theme"

export const THEMES = ["light", "dark", "system"] as const
export type Theme = (typeof THEMES)[number]

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value)
}

/** Applies a choice to the document — what the toggle does optimistically. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (theme === "system") delete root.dataset.theme
  else root.dataset.theme = theme
}

/*
  There is deliberately no themeBootScript any more. The admin root layout
  stamps data-theme on <html> server-side from the cookie, so the first bytes
  already carry the choice: no flash, correct with JS disabled, and correct in
  view-source and screenshots. applyTheme stays because ThemeToggle is
  optimistic — it repaints immediately and the cookie catches up next request.
*/
