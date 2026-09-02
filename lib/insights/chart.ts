/**
 * Chart ink. Brand teal (#006965) stays the UI accent; marks use a slightly
 * more chromatic teal so data reads as data. The teal/amber pair passes
 * color-vision separation and 3:1 contrast checks against white cards.
 */
export const CHART = {
  /** GA4 series (users, sessions, key events). */
  teal: "#009688",
  /** Search Console series (clicks, impressions, position). */
  amber: "#B07818",
  /** Google Ads series — a third hue that still separates from teal/amber. */
  ink: "#1F3A5F",
  /** Vercel / host pageviews — cookieless, not Google. */
  host: "#6B4F8A",
  /** Previous-period comparison line — de-emphasized, never a second hue. */
  prev: "#9AA6A2",
  grid: "rgba(15,22,21,0.07)",
  axisText: "#6C7975",
  /** Delta text: direction × whether up is good. Always paired with ▲/▼. */
  good: "#1B6B3A",
  bad: "#A62228",
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
