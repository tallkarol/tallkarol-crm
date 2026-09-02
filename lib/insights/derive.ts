import type { DailyPoint, SnapshotV2, WindowTotals } from "@/lib/insights/types"
import { hideMoney, maskedMoney } from "@/lib/money-privacy"

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
  adImpressions: 0,
  adClicks: 0,
  adSpend: 0,
  adConversions: 0,
  ga4Paid: 0,
  ga4Organic: 0,
  vercelPageviews: 0,
  vercelVisitors: 0,
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
    adImpressions: 0,
    adClicks: 0,
    adSpend: 0,
    adConversions: 0,
    ga4Paid: 0,
    ga4Organic: 0,
    vercelPageviews: 0,
    vercelVisitors: 0,
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
    t.adImpressions += p.adImpressions ?? 0
    t.adClicks += p.adClicks ?? 0
    t.adSpend += p.adSpend ?? 0
    t.adConversions += p.adConversions ?? 0
    t.ga4Paid += p.ga4Paid ?? 0
    t.ga4Organic += p.ga4Organic ?? 0
    t.vercelPageviews += p.vercelPageviews ?? 0
    t.vercelVisitors += p.vercelVisitors ?? 0
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

export function fmtMoney(n: number | null | undefined, currency = "USD") {
  if (n == null) return "—"
  if (hideMoney()) return maskedMoney(currency)
  try {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: n >= 100 ? 0 : 2,
    })
  } catch {
    return `${n.toFixed(n >= 100 ? 0 : 2)} ${currency}`
  }
}

export function fmtConv(n: number | null | undefined) {
  if (n == null) return "—"
  return Number.isInteger(n) ? fmtInt(n) : n.toFixed(1)
}

export function fmtPct01(ratio: number) {
  return `${(ratio * 100).toFixed(1)}%`
}

export function ratio(num: number, den: number) {
  if (den <= 0) return null
  return num / den
}

/** CPC / CTR / CPA / conversion rate from a spend window. */
export function adsRates(t: {
  adSpend: number
  adClicks: number
  adImpressions: number
  adConversions: number
}) {
  return {
    ctr: ratio(t.adClicks, t.adImpressions),
    cpc: ratio(t.adSpend, t.adClicks),
    cpa: ratio(t.adSpend, t.adConversions),
    convRate: ratio(t.adConversions, t.adClicks),
  }
}

/** Google Ads customer ids display as XXX-XXX-XXXX. */
export function fmtCustomerId(id: string) {
  const digits = id.replace(/\D/g, "")
  if (digits.length !== 10) return id || "—"
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
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
