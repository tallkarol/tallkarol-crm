/**
 * Shapes shared by the server rollups and the client chart. Pure — no
 * database import, so a "use client" component can take them without
 * dragging the driver into the browser bundle.
 */

export type WhereMetric = "output" | "hours" | "chat"

/** One of the four vendor bars on the chat rail. */
export type UsageRailBar = {
  key: "claude-fable" | "claude-other" | "cursor-grok" | "cursor-other"
  title: string
  value: string
  pct: number | null
  age: string
  hasReading: boolean
}

/** Claude weekly Fable / other, Cursor monthly Grok / Other. */
export type UsageRailView = {
  bars: UsageRailBar[]
}

export const WHERE_METRICS: { key: WhereMetric; label: string; unit: string }[] = [
  { key: "output", label: "Claude Code output tokens", unit: "tokens" },
  { key: "hours", label: "Hours (Claude Code + Cursor)", unit: "h" },
  { key: "chat", label: "CRM chat $ (registry rates)", unit: "$" },
]

export type DayClientSeries = {
  days: string[]
  clients: string[]
  /** metric → day → client → value */
  values: Record<WhereMetric, Record<string, Record<string, number>>>
}
