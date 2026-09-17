import { sql } from "drizzle-orm"
import { iso, num, rows, ts, type ActivityFilters } from "@/lib/activity/summary/filters"

export type ModuleStat = { events: number; lastAt: string | null }

export async function moduleStats(f: ActivityFilters): Promise<Record<string, ModuleStat>> {
  const result = await rows<{ module: string; events: number; last_at: unknown }>(sql`
    select module,
      (count(*) filter (where occurred_at >= ${ts(f.since)}))::int as events,
      max(occurred_at) as last_at
    from activity_events
    where ${f.test ? sql`true` : sql`synthetic = false`}
    group by module
  `)
  const out: Record<string, ModuleStat> = {}
  result.forEach((r) => (out[r.module] = { events: num(r.events), lastAt: iso(r.last_at) }))
  return out
}

export type StorageFacts = {
  stored: number
  synthetic: number
  customers: number
  tableBytes: number
  oldestAt: string | null
  dailyRows: number
  dailyThrough: string | null
}

export async function storageFacts(f: ActivityFilters): Promise<StorageFacts> {
  const [events, size, daily] = await Promise.all([
    rows<Record<string, unknown>>(sql`
      select
        (count(*) filter (where occurred_at >= ${ts(f.since)}))::int as stored,
        (count(*) filter (where occurred_at >= ${ts(f.since)} and synthetic))::int as synthetic,
        (count(*) filter (where occurred_at >= ${ts(f.since)} and role = 'customer'))::int as customers,
        min(occurred_at) as oldest_at
      from activity_events
    `),
    rows<{ bytes: unknown }>(sql`select pg_total_relation_size('activity_events')::float8 as bytes`),
    rows<{ n: number; through: string | null }>(sql`select count(*)::int as n, max(day)::text as through from activity_daily`),
  ])
  return {
    stored: num(events[0]?.stored),
    synthetic: num(events[0]?.synthetic),
    customers: num(events[0]?.customers),
    tableBytes: num(size[0]?.bytes),
    oldestAt: iso(events[0]?.oldest_at),
    dailyRows: num(daily[0]?.n),
    dailyThrough: daily[0]?.through ?? null,
  }
}
