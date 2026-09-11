import { desc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { usageSnapshots, type UsageSnapshot } from "@/db/schema"

/**
 * Readings of caps and bills. Each source keeps its raw payload; the parsers
 * here turn the newest one into what a tile prints. The rule the page lives
 * by: a bar needs a numerator and a denominator from the same reading.
 * Otherwise the number is printed, named, and dated — never scaled.
 */

export const SNAPSHOT_SOURCES = [
  "railway",
  "claude_max",
  "cursor_dashboard",
  "vercel",
  "resend",
  "dataforseo",
] as const
export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number]

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** After this a reading is shown grey with "no current reading". */
export const STALE_AFTER: Record<SnapshotSource, number> = {
  railway: 36 * HOUR,
  claude_max: 6 * HOUR,
  cursor_dashboard: 10 * DAY,
  vercel: 2 * DAY,
  resend: 2 * DAY,
  dataforseo: 2 * DAY,
}

/** Railway project name → CRM client slug. Unknown names show unnamed. */
export const RAILWAY_PROJECT_CLIENT: Record<string, string> = {
  "artist-house": "artist-house",
  tallkarol: "tallkarol",
  mineralife: "mineralife",
}

export async function latestBySource(): Promise<Partial<Record<SnapshotSource, UsageSnapshot>>> {
  // A reading dated in the future (a typo, a wrong clock) would pin the tile
  // and read as fresh forever; the routes refuse them and this ignores any
  // that slipped through.
  const rows = await db
    .select()
    .from(usageSnapshots)
    .where(
      sql`${usageSnapshots.id} in (select distinct on (source) id from usage_snapshots where observed_at <= now() + interval '5 minutes' order by source, observed_at desc)`
    )
  const out: Partial<Record<SnapshotSource, UsageSnapshot>> = {}
  for (const row of rows) out[row.source as SnapshotSource] = row
  return out
}

export async function recentReadings(source: SnapshotSource, limit = 5) {
  return db
    .select()
    .from(usageSnapshots)
    .where(eq(usageSnapshots.source, source))
    .orderBy(desc(usageSnapshots.observedAt))
    .limit(limit)
}

export function ageMs(observedAt: Date, now: Date) {
  return Math.max(0, now.getTime() - observedAt.getTime())
}

export function ageLabel(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  const h = Math.round(ms / HOUR)
  if (h < 48) return `${h} h ago`
  return `${Math.round(ms / DAY)} d ago`
}

export function isStale(source: SnapshotSource, observedAt: Date, now: Date) {
  return ageMs(observedAt, now) > STALE_AFTER[source]
}

/* ------------------------------------------------------------------ railway */

export type RailwayReading = {
  observedAt: Date
  basis: string
  usedDollars: number
  estimatedDollars: number
  hardLimit: number | null
  softLimit: number | null
  overLimit: boolean
  periodStart: string | null
  periodEnd: string | null
  lineItems: { label: string; dollars: number }[]
  projects: { name: string; dollars: number; share: number; clientSlug: string | null }[]
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

export function parseRailway(row: UsageSnapshot): RailwayReading | null {
  const p = row.payload as { usage?: Record<string, unknown>; projects?: Record<string, unknown> }
  const usage = p.usage
  if (!usage) return null
  const limit = (usage.usageLimit ?? {}) as Record<string, unknown>
  const items = Array.isArray(usage.lineItems) ? (usage.lineItems as Record<string, unknown>[]) : []
  const projects = Array.isArray(p.projects?.projects) ? (p.projects!.projects as Record<string, unknown>[]) : []
  return {
    observedAt: row.observedAt,
    basis: row.basis,
    usedDollars: n(usage.currentUsageDollars),
    estimatedDollars: n(usage.estimatedBillDollars),
    hardLimit: typeof limit.hardLimit === "number" ? limit.hardLimit : null,
    softLimit: typeof limit.softLimit === "number" ? limit.softLimit : null,
    overLimit: limit.isOverLimit === true,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    lineItems: items.map((i) => ({ label: String(i.label ?? ""), dollars: n(i.currentUsageDollars) })),
    projects: projects
      .filter((pr) => !pr.deletedAt)
      .map((pr) => ({
        name: String(pr.name ?? ""),
        dollars: n(pr.currentUsageDollars),
        share: n(pr.share),
        clientSlug: RAILWAY_PROJECT_CLIENT[String(pr.name ?? "")] ?? null,
      }))
      .sort((a, b) => b.dollars - a.dollars),
  }
}

/* ---------------------------------------------------------------- claude max */

export type PacePair = { output: number; requests: number; cacheRead: number; hours: number; turns: number }

export type ClaudeMaxReading = {
  observedAt: Date
  basis: string
  fiveHourPct: number | null
  sevenDayPct: number | null
  resets5h: string
  resets7d: string
  pace: { h5: PacePair; d7: PacePair } | null
}

function pct(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return Math.max(0, Math.min(100, v))
}

export function parseClaudeMax(row: UsageSnapshot): ClaudeMaxReading {
  const p = row.payload as Record<string, unknown>
  const pace = p.pace && typeof p.pace === "object" ? (p.pace as ClaudeMaxReading["pace"]) : null
  return {
    observedAt: row.observedAt,
    basis: row.basis,
    fiveHourPct: pct(p.five_hour_pct),
    sevenDayPct: pct(p.seven_day_pct),
    resets5h: typeof p.resets_5h === "string" ? p.resets_5h : "",
    resets7d: typeof p.resets_7d === "string" ? p.resets_7d : "",
    pace,
  }
}

/* -------------------------------------------------------------------- cursor */

export type CursorReading = {
  observedAt: Date
  basis: string
  planPct: number | null
  cursorModelsPct: number | null
  otherModelsUsd: number | null
  /** The pool's size as the dashboard showed it — the bar's denominator, from the same reading. */
  otherModelsPoolUsd: number | null
  otherModelsPct: number | null
  onDemandUsd: number | null
  cycleEnd: string
}

function money(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : null
}

export function parseCursor(row: UsageSnapshot): CursorReading {
  const p = row.payload as Record<string, unknown>
  return {
    observedAt: row.observedAt,
    basis: row.basis,
    planPct: pct(p.plan_pct),
    cursorModelsPct: pct(p.cursor_models_pct),
    otherModelsUsd: money(p.other_models_usd),
    otherModelsPoolUsd: money(p.other_models_pool_usd),
    otherModelsPct: pct(p.other_models_pct),
    onDemandUsd: money(p.on_demand_usd),
    cycleEnd: typeof p.cycle_end === "string" ? p.cycle_end : "",
  }
}

/**
 * The Other-models pool as the plan describes it today. Only a fallback
 * label: the bar's denominator is the pool size typed with the reading, so
 * numerator and denominator come from the same dashboard visit.
 */
export const CURSOR_OTHER_POOL_USD = 400
