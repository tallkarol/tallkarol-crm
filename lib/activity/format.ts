/** Formatters for the /activity page, PURE. Units never mix: ms stay ms until one of these turns them into words. */

/**
 * A timestamp from a raw query, as ISO. Drizzle's postgres-js driver leaves
 * timestamptz as Postgres text ("2026-09-12 23:02:23.45+00"), which `new
 * Date()` does not reliably parse — the "+00" offset has no minutes.
 */
export function toIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value !== "string" || !value) return null
  const normal = value.includes("T") ? value : value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
  const date = new Date(normal)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`
  return formatActive(ms)
}

/** Active time: whole minutes, hours when there are any. */
export function formatActive(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "0m"
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return "<1m"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`
}

export function formatCount(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US")
}

export function formatShare(part: number, whole: number): string {
  if (!whole) return "—"
  const pct = (part / whole) * 100
  if (pct > 0 && pct < 1) return "<1%"
  return `${Math.round(pct)}%`
}

export function formatCls(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2)
}

/** "4 s ago", "12 min ago", "3 h ago", "yesterday", "Tue", "3 Aug". */
export function formatAge(at: Date | string | null | undefined, now: Date, tz: string): string {
  if (!at) return "—"
  const date = typeof at === "string" ? new Date(at) : at
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))} s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz })
  if (day(date) === day(now)) return `${Math.round(diff / 3_600_000)} h ago`
  if (day(date) === day(new Date(now.getTime() - 86_400_000))) return "yesterday"
  if (diff < 6 * 86_400_000) return date.toLocaleDateString("en-GB", { weekday: "short", timeZone: tz })
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz })
}

export function formatClock(at: Date | string, tz: string, seconds = true): string {
  const date = typeof at === "string" ? new Date(at) : at
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hour12: false,
    timeZone: tz,
  })
}

/** "task.setStatus" → "Task · set status"; "tasks.filter.client" → "Tasks · filter · client". */
export function humanizeId(id: string): string {
  const parts = id
    .split(/[.:]/)
    .filter(Boolean)
    .map((p) => p.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").toLowerCase())
  if (!parts.length) return id
  parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  return parts.join(" · ")
}

/** Google's web-vitals thresholds, for the Speed tab's pills. */
export const VITAL_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
} as const

export type VitalName = keyof typeof VITAL_THRESHOLDS

export function vitalRating(name: VitalName, value: number | null): "good" | "needs-improvement" | "poor" | null {
  if (value === null || !Number.isFinite(value)) return null
  const t = VITAL_THRESHOLDS[name]
  return value <= t.good ? "good" : value <= t.poor ? "needs-improvement" : "poor"
}
