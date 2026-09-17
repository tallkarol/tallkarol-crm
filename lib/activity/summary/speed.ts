import { sql } from "drizzle-orm"
import { inWindow, iso, maybeNum, num, rows, sliceSql, ts, type ActivityFilters } from "@/lib/activity/summary/filters"

/**
 * Timings exclude the `local` deploy: Karol's dev server shares the
 * production database, and a dev compile would own every p95.
 */
const NOT_LOCAL = sql`deploy <> 'local'`
/** Full loads measure from navigation start, not from a click, so "ready after a click" leaves them out. */
const SOFT_VIEW = sql`kind = 'page.view' and coalesce(props->>'via', '') not in ('outside', 'reload')`

export type ActionTiming = { target: string; runs: number; failed: number; p50Ms: number | null; p95Ms: number | null; waitedMs: number }

export async function actionTimings(f: ActivityFilters, limit = 25): Promise<ActionTiming[]> {
  const result = await rows<Record<string, unknown>>(sql`
    select target, count(*)::int as runs, (count(*) filter (where ok = false))::int as failed,
      (percentile_cont(0.5) within group (order by duration_ms))::float8 as p50,
      (percentile_cont(0.95) within group (order by duration_ms))::float8 as p95,
      coalesce(sum(duration_ms), 0)::float8 as waited
    from activity_events
    where kind = 'action.run' and ${NOT_LOCAL} and ${inWindow(f)}
    group by target
    order by waited desc
    limit ${limit}
  `)
  return result.map((r) => ({
    target: String(r.target ?? ""),
    runs: num(r.runs),
    failed: num(r.failed),
    p50Ms: maybeNum(r.p50),
    p95Ms: maybeNum(r.p95),
    waitedMs: num(r.waited),
  }))
}

export type PageSpeed = {
  route: string
  views: number
  readyP75: number | null
  lcp: number | null
  inp: number | null
  cls: number | null
  vitals: number
}

export async function pageSpeed(f: ActivityFilters, limit = 20): Promise<PageSpeed[]> {
  const result = await rows<Record<string, unknown>>(sql`
    select route,
      (count(*) filter (where kind = 'page.view'))::int as views,
      (percentile_cont(0.75) within group (order by duration_ms) filter (where ${SOFT_VIEW}))::float8 as ready_p75,
      (percentile_cont(0.75) within group (order by duration_ms) filter (where kind = 'vitals.lcp'))::float8 as lcp,
      (percentile_cont(0.75) within group (order by duration_ms) filter (where kind = 'vitals.inp'))::float8 as inp,
      (percentile_cont(0.75) within group (order by (props->>'value')::float8) filter (where kind = 'vitals.cls'))::float8 as cls,
      (count(*) filter (where module = 'vitals'))::int as vitals
    from activity_events
    where (kind = 'page.view' or module = 'vitals') and ${NOT_LOCAL} and ${inWindow(f)}
    group by route
    order by views desc
    limit ${limit}
  `)
  return result.map((r) => ({
    route: String(r.route ?? "/"),
    views: num(r.views),
    readyP75: maybeNum(r.ready_p75),
    lcp: maybeNum(r.lcp),
    inp: maybeNum(r.inp),
    cls: maybeNum(r.cls),
    vitals: num(r.vitals),
  }))
}

/** Below these, a percentile is noise and the page says how many readings it has instead. */
export const MIN_SAMPLES = { actionRuns: 30, views: 50, inp: 50 }

export type PeriodMetrics = {
  topRuns: number
  topP95: number | null
  views: number
  readyP75: number | null
  inpN: number
  inpP75: number | null
  errors: number
}

export type DeployComparison = {
  deploy: string
  firstAt: string
  /** When the next deploy took over, or null for the live one. */
  until: string | null
  topAction: string | null
  after: PeriodMetrics
  before: PeriodMetrics
}

async function period(f: ActivityFilters, from: Date, to: Date, topAction: string | null, deploy?: string): Promise<PeriodMetrics> {
  const onDeploy = deploy ? sql`deploy = ${deploy}` : NOT_LOCAL
  const [r] = await rows<Record<string, unknown>>(sql`
    select
      (count(*) filter (where kind = 'action.run' and target = ${topAction ?? ""}))::int as top_runs,
      (percentile_cont(0.95) within group (order by duration_ms) filter (where kind = 'action.run' and target = ${topAction ?? ""}))::float8 as top_p95,
      (count(*) filter (where kind = 'page.view'))::int as views,
      (percentile_cont(0.75) within group (order by duration_ms) filter (where ${SOFT_VIEW}))::float8 as ready_p75,
      (count(*) filter (where kind = 'vitals.inp'))::int as inp_n,
      (percentile_cont(0.75) within group (order by duration_ms) filter (where kind = 'vitals.inp'))::float8 as inp_p75,
      (count(*) filter (where kind = 'error.client'))::int as errors
    from activity_events
    where occurred_at >= ${ts(from)} and occurred_at < ${ts(to)} and ${onDeploy} and ${sliceSql(f)}
  `)
  return {
    topRuns: num(r?.top_runs),
    topP95: maybeNum(r?.top_p95),
    views: num(r?.views),
    readyP75: maybeNum(r?.ready_p75),
    inpN: num(r?.inp_n),
    inpP75: maybeNum(r?.inp_p75),
    errors: num(r?.errors),
  }
}

/** The last few deploys, each against the seven days before it went live. */
export async function deployComparisons(f: ActivityFilters, topAction: string | null, count = 4): Promise<DeployComparison[]> {
  const deploys = await rows<{ deploy: string; first_at: unknown }>(sql`
    select deploy, min(occurred_at) as first_at
    from activity_events
    where synthetic = false and deploy <> '' and ${NOT_LOCAL}
    group by deploy
    order by first_at desc
    limit ${count}
  `)
  return Promise.all(
    deploys.map(async (d, i) => {
      const firstAt = new Date(iso(d.first_at) ?? f.now.toISOString())
      const next = i > 0 ? deploys[i - 1] : null
      const until = next ? new Date(iso(next.first_at) ?? f.now.toISOString()) : f.now
      const [after, before] = await Promise.all([
        period(f, firstAt, until, topAction, d.deploy),
        period(f, new Date(firstAt.getTime() - 7 * 86_400_000), firstAt, topAction),
      ])
      return { deploy: d.deploy, firstAt: firstAt.toISOString(), until: next ? until.toISOString() : null, topAction, after, before }
    })
  )
}
