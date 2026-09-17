import { sql } from "drizzle-orm"
import { RAW_DAYS } from "@/lib/activity/rollup"
import { inWindow, iso, num, rows, ts, windowDayKeys, type ActivityFilters } from "@/lib/activity/summary/filters"
import { dayInZone, startOfDayInZone } from "@/lib/usage/time"

export type Readings = {
  activeMs: number
  views: number
  actions: number
  failed: number
  friction: number
  errors: number
  errorKinds: number
}

const EMPTY: Readings = { activeMs: 0, views: 0, actions: 0, failed: 0, friction: 0, errors: 0, errorKinds: 0 }

async function rawReadings(f: ActivityFilters, from: Date, to: Date): Promise<Readings> {
  const [r] = await rows<Record<string, unknown>>(sql`
    select
      coalesce(sum(duration_ms) filter (where kind = 'page.leave'), 0)::float8 as active_ms,
      (count(*) filter (where kind = 'page.view'))::int as views,
      (count(*) filter (where kind = 'action.run'))::int as actions,
      (count(*) filter (where kind = 'action.run' and ok = false))::int as failed,
      (count(*) filter (where module = 'frustration'))::int as friction,
      (count(*) filter (where kind = 'error.client'))::int as errors,
      (count(distinct props->>'fingerprint') filter (where kind = 'error.client'))::int as error_kinds
    from activity_events
    where ${inWindow(f, from, to)}
  `)
  if (!r) return { ...EMPTY }
  return {
    activeMs: num(r.active_ms),
    views: num(r.views),
    actions: num(r.actions),
    failed: num(r.failed),
    friction: num(r.friction),
    errors: num(r.errors),
    errorKinds: num(r.error_kinds),
  }
}

/** Days already folded into activity_daily. Error kinds are not kept there, so they stay raw-only. */
async function dailyReadings(f: ActivityFilters, fromDay: string, toDay: string): Promise<Readings> {
  const parts = [sql`day >= ${fromDay}::date and day < ${toDay}::date`]
  if (f.surface !== "all") parts.push(sql`surface = ${f.surface}`)
  if (f.who !== "all") parts.push(sql`role = ${f.who}`)
  const [r] = await rows<Record<string, unknown>>(sql`
    select
      coalesce(sum(sum_ms) filter (where kind = 'page.leave'), 0)::float8 as active_ms,
      coalesce(sum(count) filter (where kind = 'page.view'), 0)::int as views,
      coalesce(sum(count) filter (where kind = 'action.run'), 0)::int as actions,
      coalesce(sum(failed) filter (where kind = 'action.run'), 0)::int as failed,
      coalesce(sum(count) filter (where kind like 'frustration.%'), 0)::int as friction,
      coalesce(sum(count) filter (where kind = 'error.client'), 0)::int as errors
    from activity_daily
    where ${sql.join(parts, sql` and `)}
  `)
  if (!r) return { ...EMPTY }
  return { ...EMPTY, activeMs: num(r.active_ms), views: num(r.views), actions: num(r.actions), failed: num(r.failed), friction: num(r.friction), errors: num(r.errors) }
}

export async function readings(f: ActivityFilters): Promise<{ cur: Readings; prev: Readings }> {
  const rawCutoff = startOfDayInZone(new Date(f.now.getTime() - RAW_DAYS * 86_400_000), f.tz)
  const prevRawFrom = f.prevSince > rawCutoff ? f.prevSince : rawCutoff
  const [cur, prevRaw, prevDaily] = await Promise.all([
    rawReadings(f, f.since, f.until),
    prevRawFrom < f.since ? rawReadings(f, prevRawFrom, f.since) : Promise.resolve({ ...EMPTY }),
    f.prevSince < rawCutoff
      ? dailyReadings(f, dayInZone(f.prevSince, f.tz), dayInZone(rawCutoff, f.tz))
      : Promise.resolve({ ...EMPTY }),
  ])
  const prev: Readings = {
    activeMs: prevRaw.activeMs + prevDaily.activeMs,
    views: prevRaw.views + prevDaily.views,
    actions: prevRaw.actions + prevDaily.actions,
    failed: prevRaw.failed + prevDaily.failed,
    friction: prevRaw.friction + prevDaily.friction,
    errors: prevRaw.errors + prevDaily.errors,
    errorKinds: prevRaw.errorKinds,
  }
  return { cur, prev }
}

export type ActiveByDay = { days: string[]; bySurface: Record<string, number[]> }

export async function activeByDay(f: ActivityFilters): Promise<ActiveByDay> {
  const days = windowDayKeys(f)
  const index = new Map(days.map((d, i) => [d, i] as const))
  const result = await rows<{ day: string; surface: string; ms: unknown }>(sql`
    select to_char(occurred_at at time zone ${f.tz}, 'YYYY-MM-DD') as day, surface, sum(duration_ms)::float8 as ms
    from activity_events
    where kind = 'page.leave' and ${inWindow(f)}
    group by 1, 2
  `)
  const bySurface: Record<string, number[]> = {
    browser: days.map(() => 0),
    mac_app: days.map(() => 0),
    phone: days.map(() => 0),
  }
  result.forEach((r) => {
    const i = index.get(r.day)
    if (i === undefined || !bySurface[r.surface]) return
    bySurface[r.surface][i] += num(r.ms)
  })
  return { days, bySurface }
}

/** Active ms by weekday (Monday first) × hour, in the workspace zone. */
export async function heat(f: ActivityFilters): Promise<number[][]> {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[])
  const result = await rows<{ dow: number; hour: number; ms: unknown }>(sql`
    select
      extract(isodow from occurred_at at time zone ${f.tz})::int as dow,
      extract(hour from occurred_at at time zone ${f.tz})::int as hour,
      sum(duration_ms)::float8 as ms
    from activity_events
    where kind = 'page.leave' and ${inWindow(f)}
    group by 1, 2
  `)
  result.forEach((r) => {
    const d = Number(r.dow) - 1
    const h = Number(r.hour)
    if (d >= 0 && d < 7 && h >= 0 && h < 24) grid[d][h] += num(r.ms)
  })
  return grid
}

export type ViaRow = { route: string; views: number; via: Record<string, number> }

/** Page views by route and how they arrived. `from` defaults to the window; the ⌘K rule reads 30 days. */
export async function viaByRoute(f: ActivityFilters, from: Date = f.since): Promise<ViaRow[]> {
  const result = await rows<{ route: string; via: string; n: number }>(sql`
    select route, coalesce(props->>'via', 'other') as via, count(*)::int as n
    from activity_events
    where kind = 'page.view' and ${inWindow(f, from)}
    group by 1, 2
  `)
  const byRoute = new Map<string, ViaRow>()
  result.forEach((r) => {
    const row = byRoute.get(r.route) ?? { route: r.route, views: 0, via: {} }
    row.views += num(r.n)
    row.via[r.via] = (row.via[r.via] ?? 0) + num(r.n)
    byRoute.set(r.route, row)
  })
  return Array.from(byRoute.values()).sort((a, b) => b.views - a.views)
}

export type HeaderFacts = {
  firstAt: string | null
  lastAt: string | null
  /** Verification events in the window that the page is hiding. */
  hiddenTest: number
  /** Whole days since the first real event. */
  trackedDays: number
}

export async function headerFacts(f: ActivityFilters): Promise<HeaderFacts> {
  // With verification traffic shown, it counts toward "last event" like everything else on the page.
  const counted = f.test ? sql`true` : sql`synthetic = false`
  const [r] = await rows<Record<string, unknown>>(sql`
    select
      min(occurred_at) filter (where ${counted}) as first_at,
      max(occurred_at) filter (where ${counted}) as last_at,
      (count(*) filter (where synthetic = true and occurred_at >= ${ts(f.since)}))::int as hidden_test
    from activity_events
  `)
  const firstAt = iso(r?.first_at)
  const trackedDays = firstAt ? Math.floor((f.now.getTime() - new Date(firstAt).getTime()) / 86_400_000) : 0
  return { firstAt, lastAt: iso(r?.last_at), hiddenTest: f.test ? 0 : num(r?.hidden_test), trackedDays }
}
