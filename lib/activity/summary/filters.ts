import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { toIso } from "@/lib/activity/format"
import { dayInZone, startOfDayInZone } from "@/lib/usage/time"

/**
 * The slice every /activity query reads: whole days in the workspace zone,
 * today included (the /usage convention), plus surface and role, with
 * verification traffic out unless asked for. Rollups are group-bys at read
 * time — nothing on the page is a stored total.
 */

export const SURFACE_FILTERS = ["all", "browser", "mac_app", "phone"] as const
export const WHO_FILTERS = ["all", "admin", "customer"] as const
export type SurfaceFilter = (typeof SURFACE_FILTERS)[number]
export type WhoFilter = (typeof WHO_FILTERS)[number]

export type ActivityFilters = {
  days: number
  since: Date
  until: Date
  prevSince: Date
  tz: string
  now: Date
  surface: SurfaceFilter
  who: WhoFilter
  /** Include verification traffic. */
  test: boolean
}

export function windowDays(raw: string | undefined): number {
  const n = Number(raw)
  return n === 30 ? 30 : n === 90 ? 90 : 7
}

export function parseFilters(params: Record<string, string | undefined>, now: Date, tz: string): ActivityFilters {
  const days = windowDays(params.days)
  const today = startOfDayInZone(now, tz)
  const since = startOfDayInZone(new Date(today.getTime() - (days - 1) * 86_400_000 + 3_600_000), tz)
  const prevSince = startOfDayInZone(new Date(since.getTime() - days * 86_400_000 + 3_600_000), tz)
  return {
    days,
    since,
    until: now,
    prevSince,
    tz,
    now,
    surface: SURFACE_FILTERS.includes(params.surface as SurfaceFilter) ? (params.surface as SurfaceFilter) : "all",
    who: WHO_FILTERS.includes(params.who as WhoFilter) ? (params.who as WhoFilter) : "all",
    test: params.test === "1",
  }
}

/** The window's calendar days, oldest first, as YYYY-MM-DD in the workspace zone. */
export function windowDayKeys(f: ActivityFilters): string[] {
  const keys: string[] = []
  for (let i = 0; i < f.days; i++) keys.push(dayInZone(new Date(f.since.getTime() + i * 86_400_000 + 12 * 3_600_000), f.tz))
  return Array.from(new Set(keys)).slice(0, f.days)
}

/** Surface, role and test-traffic conditions, without the time range. */
export function sliceSql(f: Pick<ActivityFilters, "surface" | "who" | "test">): SQL {
  const parts: SQL[] = [sql`true`]
  if (!f.test) parts.push(sql`synthetic = false`)
  if (f.surface !== "all") parts.push(sql`surface = ${f.surface}`)
  if (f.who !== "all") parts.push(sql`role = ${f.who}`)
  return sql.join(parts, sql` and `)
}

export function inWindow(f: ActivityFilters, from: Date = f.since, to: Date = f.until): SQL {
  return sql`occurred_at >= ${ts(from)} and occurred_at < ${ts(to)} and ${sliceSql(f)}`
}

/**
 * A timestamp parameter for raw SQL. postgres-js cannot bind a Date inside
 * db.execute(sql`…`) — it needs the ISO string and an explicit cast.
 */
export function ts(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`
}

export async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[]
}

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0)
export const maybeNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
export const iso = toIso
