/** Stable per-client accent colors used across lists, boards, and meters. */
export const CLIENT_COLORS: Record<string, string> = {
  gdi: "#3A5FA8",
  mineralife: "#2F7D4F",
  zemvelo: "#A3652A",
  "artist-house": "#7C4DA0",
  dqs: "#B04A5A",
  domynovy: "#54687A",
  "caps-fieldhouse": "#155E75",
  "bliss-cb": "#6B7A2E",
  "total-soccer-academy": "#9B3D6E",
  sondry: "#1F3A4D",
  spectramotus: "#5B3A8C",
  momentum: "#C45C26",
  jive: "#0E7A6B",
  daedalus: "#3E4A7A",
}

/* Chart-only palette — re-stepped from the UI set and validated for
   colorblind-safe adjacency (see InvoicesHub for the UI set). */
export const CHART_COLORS: Record<string, string> = {
  mineralife: "#1F6B3F",
  zemvelo: "#B97C21",
  gdi: "#4C74C9",
  "artist-house": "#6B3E92",
  dqs: "#C25B64",
  domynovy: "#54687A",
  "caps-fieldhouse": "#1A7A8C",
}

/** Fixed stack order for revenue charts — matches the validated palette order. */
export const CHART_ORDER = [
  "mineralife",
  "zemvelo",
  "gdi",
  "artist-house",
  "dqs",
  "domynovy",
  "caps-fieldhouse",
]

const FALLBACK_COLORS = ["#006965", "#3A5FA8", "#7C4DA0", "#A3652A", "#B04A5A"]

/**
 * Overrides set in Settings → Colours, layered over CLIENT_COLORS.
 *
 * Deliberately a module-level map rather than a parameter: `clientColor(slug)`
 * is called from 73 places, about a third of them inside client components, and
 * threading a colour map through all of them would be a refactor in search of a
 * feature. Hydrated on the server by `hydrateClientColors()` in the admin
 * layout, and in the browser from a script tag the same layout emits.
 */
let overrides: Record<string, string> = {}
let readWindow = false

export function setColorOverrides(next: Record<string, string>) {
  overrides = next
}

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

/** The global the admin layout writes for the browser bundle to pick up. */
export const COLOR_GLOBAL = "__TK_CLIENT_COLORS__"

function currentOverrides(): Record<string, string> {
  // In the browser the map arrives as a script tag evaluated before hydration,
  // so read it once on first use rather than depending on component order.
  if (!readWindow && typeof window !== "undefined") {
    readWindow = true
    const fromWindow = (window as unknown as Record<string, unknown>)[COLOR_GLOBAL]
    if (fromWindow && typeof fromWindow === "object") {
      overrides = fromWindow as Record<string, string>
    }
  }
  return overrides
}

export function clientColor(slug: string) {
  const stored = currentOverrides()[slug]
  if (stored) return stored
  if (CLIENT_COLORS[slug]) return CLIENT_COLORS[slug]
  let hash = 0
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) % 997
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

export function chartColor(slug: string) {
  // An explicit override wins over the chart palette: if someone has chosen a
  // colour for a client by hand, a chart showing a different one is a bug.
  const stored = currentOverrides()[slug]
  if (stored) return stored
  return CHART_COLORS[slug] ?? clientColor(slug)
}
