import type { DailyPoint, SnapshotV2, WindowTotals } from "@/lib/insights/types"

/** The site's reporting timezone. GA4/GSC both report property-local days. */
const REPORT_TZ = "Europe/Warsaw"

export function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

export function todayKey() {
  return dayKey(new Date())
}

export function addDays(iso: string, delta: number) {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return dt.toISOString().slice(0, 10)
}

/** Ascending list of the `days` day-keys ending at `end` (inclusive). */
export function dayAxis(end: string, days: number) {
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) out.push(addDays(end, -i))
  return out
}

export const EMPTY_DAY: Omit<DailyPoint, "date"> = {
  users: 0,
  sessions: 0,
  newUsers: 0,
  eventCount: 0,
  keyEvents: 0,
  clicks: 0,
  impressions: 0,
  position: null,
}

export type RangeDays = 7 | 28 | 90

export function parseRange(raw: string | undefined): RangeDays {
  if (raw === "7") return 7
  if (raw === "90") return 90
  return 28
}

export function windowTotals(points: DailyPoint[]): WindowTotals {
  const t: WindowTotals = {
    users: 0,
    sessions: 0,
    newUsers: 0,
    eventCount: 0,
    keyEvents: 0,
    clicks: 0,
    impressions: 0,
    avgPosition: null,
  }
  let posWeight = 0
  let posSum = 0
  for (const p of points) {
    t.users += p.users
    t.sessions += p.sessions
    t.newUsers += p.newUsers
    t.eventCount += p.eventCount
    t.keyEvents += p.keyEvents
    t.clicks += p.clicks
    t.impressions += p.impressions
    if (p.position != null && p.impressions > 0) {
      posSum += p.position * p.impressions
      posWeight += p.impressions
    }
  }
  t.avgPosition = posWeight > 0 ? posSum / posWeight : null
  return t
}

export type DerivedWindow = {
  days: RangeDays
  /** Current window, ascending. */
  current: DailyPoint[]
  /** The window immediately before it, ascending. Shorter if data ran out. */
  previous: DailyPoint[]
  totals: WindowTotals
  previousTotals: WindowTotals | null
  label: string
}

/**
 * Slice the 90-day series into a current window and the one before it. For
 * the 90-day range there is no previous window — deltas render as "—".
 */
export function deriveWindow(snapshot: SnapshotV2, days: RangeDays): DerivedWindow {
  const daily = snapshot.daily
  const current = daily.slice(-days)
  const previous = days * 2 <= daily.length ? daily.slice(-days * 2, -days) : []
  const first = current[0]?.date
  const last = current[current.length - 1]?.date
  return {
    days,
    current,
    previous,
    totals: windowTotals(current),
    previousTotals: previous.length === days ? windowTotals(previous) : null,
    label: first && last ? `${fmtDay(first)} – ${fmtDay(last)}` : "",
  }
}

/** Percent change; null when there is no previous value to compare against. */
export function deltaPct(cur: number, prev: number | null | undefined) {
  if (prev == null || prev === 0) return null
  return ((cur - prev) / prev) * 100
}

export function fmtInt(n: number | null | undefined) {
  if (n == null) return "—"
  return n.toLocaleString("en-US")
}

export function fmtPct01(ratio: number) {
  return `${(ratio * 100).toFixed(1)}%`
}

export function fmtDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function fmtDayYear(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function monthPeriod(iso: string) {
  return iso.slice(0, 7)
}

export function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** Resample a series to `n` points for a small sparkline. */
export function resample(values: number[], n = 12) {
  if (values.length === 0) return []
  if (values.length <= n) return values
  const step = (values.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => values[Math.round(i * step)])
}
