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

export function clientColor(slug: string) {
  if (CLIENT_COLORS[slug]) return CLIENT_COLORS[slug]
  let hash = 0
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) % 997
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

export function chartColor(slug: string) {
  return CHART_COLORS[slug] ?? clientColor(slug)
}
