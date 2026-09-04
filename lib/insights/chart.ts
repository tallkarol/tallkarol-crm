/**
 * Chart ink. Every value is a CSS var reference, not a hex.
 *
 * These land in `style` objects, Tailwind fill and stroke utilities and SVG
 * presentation attributes — and a presentation attribute is parsed as a CSS
 * declaration, so var() substitution applies there too. Verified in Chrome
 * against both `fill="var(--x)"` and `fill="rgb(var(--x-rgb))"`, and verified
 * that Recharts 3.10 passes fill/stroke straight through to the attribute
 * without touching the string. That is why there is no useChartColors() hook
 * and no hydration gate: none is needed.
 *
 * The dark set is RE-STEPPED, not alpha-faded. #1F3A5F (Ads) is 1.45:1 on the
 * dark card and no opacity trick recovers it; the palette inverts, so it needs
 * values. See the --chart-* block in app/globals.css.
 *
 * --chart-prev moves in LIGHT too: #9AA6A2 was 2.51:1 on the white card and
 * 2.10:1 on linen, already under the 3:1 line floor before dark mode existed.
 */
export const CHART = {
  /** GA4 series (users, sessions, key events). */
  teal: "var(--chart-teal)",
  /** Search Console series (clicks, impressions, position). */
  amber: "var(--chart-amber)",
  /** Google Ads series — a third hue that still separates from teal/amber. */
  ink: "var(--chart-ink)",
  /** Vercel / host pageviews — cookieless, not Google. */
  host: "var(--chart-host)",
  /** Cash / forecast series. */
  cash: "var(--chart-cash)",
  /** Previous-period comparison line — de-emphasized, never a second hue. */
  prev: "var(--chart-prev)",
  /** Gridlines inside the plot. */
  grid: "var(--chart-grid)",
  /** The axis BASELINE is a step heavier than the grid — it is the frame, not
   *  a rule. Folding it into grid lightened the printed report's x-axis ~30%. */
  axisLine: "var(--chart-axis-line)",
  /** Axis labels are TEXT at 10px and owe 4.5:1. The old #71807D was 4.02 on
   *  the dark card and 4.13 on the white one — marginal in both. */
  axisText: "var(--chart-axis)",
  /** "The surface behind the mark", never literally white. */
  halo: "var(--chart-halo)",
  /** Hover cursor band. The old rgba(15,22,21,0.04) composited to EXACTLY
   *  #172020 on the dark card: zero pixels changed on hover. */
  cursor: "var(--chart-cursor)",
  /** Unfilled meter track. Not bg-well: BarList renders on the frozen portal
   *  and print report, and this holds the light value at 1.208 vs 1.200. */
  track: "var(--chart-track)",
  /** Delta text: direction × whether up is good. Always paired with ▲/▼. */
  good: "var(--chart-good)",
  bad: "var(--chart-bad)",
} as const

export type ChartSeries = "teal" | "amber" | "ink"

export const METRIC_META = {
  users: { label: "Users", series: "teal", money: false },
  sessions: { label: "Sessions", series: "teal", money: false },
  keyEvents: { label: "Key events", series: "teal", money: false },
  clicks: { label: "Clicks", series: "amber", money: false },
  impressions: { label: "Impressions", series: "amber", money: false },
  adSpend: { label: "Ad spend", series: "ink", money: true },
  adClicks: { label: "Ad clicks", series: "ink", money: false },
  adImpressions: { label: "Ad impressions", series: "ink", money: false },
  adConversions: { label: "Ad conversions", series: "ink", money: false },
} as const

export type TrendMetric = keyof typeof METRIC_META
