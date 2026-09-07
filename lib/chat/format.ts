import { MODELS, type ModelKey } from "@/lib/chat/models"

/**
 * Labels for the chat page. PURE, so the client components can share them
 * with the server render.
 *
 * Every time here is formatted in ONE zone, on both sides of hydration. The
 * server runs in UTC on Railway and Karol's browser in Warsaw, so formatting
 * "in the viewer's zone" would render one DOM on the server and another on
 * the client — and a day heading that moves is a hydration error, not a
 * cosmetic one. Warsaw is the CRM's home zone (calendar defaults agree).
 */
export const CHAT_ZONE = "Europe/Warsaw"

const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CHAT_ZONE,
})
const key = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: CHAT_ZONE,
})
const long = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: CHAT_ZONE,
})
const longYear = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: CHAT_ZONE,
})
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: CHAT_ZONE })
const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: CHAT_ZONE })

const DAY = 86_400_000

export function timeLabel(at: string | Date): string {
  return time.format(new Date(at))
}

/** "2026-09-07" in the home zone — the grouping key for day headings. */
export function dayKey(at: string | Date): string {
  return key.format(new Date(at))
}

export type DayBucket = "today" | "yesterday" | "earlier"

export function dayBucket(at: string | Date, now: Date): DayBucket {
  const k = dayKey(at)
  if (k === dayKey(now)) return "today"
  if (k === dayKey(new Date(now.getTime() - DAY))) return "yesterday"
  return "earlier"
}

/** The day heading over a run of messages. */
export function dayLabel(at: string | Date, now: Date): string {
  const bucket = dayBucket(at, now)
  if (bucket === "today") return "Today"
  if (bucket === "yesterday") return "Yesterday"
  const date = new Date(at)
  return date.getFullYear() === now.getFullYear() ? long.format(date) : longYear.format(date)
}

/** The stamp on a thread row: a time under Today, a weekday this week, else a date. */
export function listStamp(at: string | Date, now: Date): string {
  const date = new Date(at)
  const bucket = dayBucket(date, now)
  if (bucket !== "earlier") return time.format(date)
  if (now.getTime() - date.getTime() < 6 * DAY) return weekday.format(date)
  return short.format(date)
}

/** Cents to dollars, with enough places that a Composer turn is not "$0.00". */
export function dollars(cents: number): string {
  const d = cents / 100
  if (d === 0) return "$0"
  if (d < 0.1) return `$${d.toFixed(3)}`
  return `$${d.toFixed(2)}`
}

export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function modelLabel(model: string): string {
  return MODELS[model as ModelKey]?.label ?? model
}

export function modelPool(model: string): "cursor" | "other" | "none" {
  return MODELS[model as ModelKey]?.pool ?? "none"
}

/** "Composer 2.5 → Fable 5.1 Max" for a thread that climbed, or the one model it used. */
export function modelChain(models: string[]): string {
  const labels: string[] = []
  for (const m of models) {
    const label = modelLabel(m)
    if (labels[labels.length - 1] !== label) labels.push(label)
  }
  if (labels.length <= 1) return labels[0] ?? ""
  return `${labels[0]} → ${labels[labels.length - 1]}`
}

/** A read tool's result, counted for the chip: entries, rows, matches, a total. */
export function resultCount(result: unknown): number | null {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  if (typeof r.total === "number") return r.total
  if (typeof r.count === "number") return r.count
  for (const k of ["entries", "rows", "sessions", "messages", "items", "matches", "mail", "events", "tasks", "notes", "pins", "boards"]) {
    if (Array.isArray(r[k])) return (r[k] as unknown[]).length
  }
  return null
}
