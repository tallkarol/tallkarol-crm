import { sql } from "drizzle-orm"
import { db } from "@/db"
import { ts } from "@/lib/activity/summary/filters"
import { workspaceTimezone } from "@/lib/timezone"
import { startOfDayInZone } from "@/lib/usage/time"

/**
 * Retention: raw events live RAW_DAYS, then fold into activity_daily (Karol's
 * sign-off: 90 days raw, daily rollups kept). Runs from tick() every 15
 * minutes and does nothing until a whole day has aged out — the cutoff is a
 * midnight in the workspace zone, so a day is never split between the two
 * tables. Verification traffic is deleted without being rolled.
 */

export const RAW_DAYS = 90

export async function rollupActivity(now = new Date()): Promise<{ rolled: number; deleted: number }> {
  const tz = await workspaceTimezone()
  const cutoff = startOfDayInZone(new Date(now.getTime() - RAW_DAYS * 86_400_000), tz)

  const due = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from activity_events where occurred_at < ${ts(cutoff)}`
  )
  if (!Number(due[0]?.n)) return { rolled: 0, deleted: 0 }

  return db.transaction(async (tx) => {
    const rolled = await tx.execute<{ n: number }>(sql`
      with folded as (
        insert into activity_daily (day, kind, route, target, surface, role, count, failed, sum_ms, p50_ms, p95_ms)
        select
          (occurred_at at time zone ${tz})::date,
          kind,
          route,
          coalesce(target, ''),
          surface,
          role,
          count(*)::int,
          (count(*) filter (where ok = false))::int,
          coalesce(sum(duration_ms), 0)::bigint,
          (percentile_cont(0.5) within group (order by duration_ms))::int,
          (percentile_cont(0.95) within group (order by duration_ms))::int
        from activity_events
        where occurred_at < ${ts(cutoff)} and synthetic = false
        group by 1, 2, 3, 4, 5, 6
        on conflict (day, kind, route, target, surface, role) do update set
          count = activity_daily.count + excluded.count,
          failed = activity_daily.failed + excluded.failed,
          sum_ms = activity_daily.sum_ms + excluded.sum_ms,
          p50_ms = coalesce(excluded.p50_ms, activity_daily.p50_ms),
          p95_ms = greatest(excluded.p95_ms, activity_daily.p95_ms)
        returning 1
      )
      select count(*)::int as n from folded
    `)
    const deleted = await tx.execute<{ n: number }>(sql`
      with gone as (delete from activity_events where occurred_at < ${ts(cutoff)} returning 1)
      select count(*)::int as n from gone
    `)
    return { rolled: Number(rolled[0]?.n) || 0, deleted: Number(deleted[0]?.n) || 0 }
  })
}
