import { sql } from "drizzle-orm"
import { inWindow, iso, maybeNum, num, rows, type ActivityFilters } from "@/lib/activity/summary/filters"

export type FrictionCounts = { rage: number; quickback: number; abandon: number; flipflop: number }
export type TargetCount = { route: string; target: string; n: number; median: number | null }
export type QuickBackRow = { route: string; n: number; topTo: string | null; topToN: number }
export type FailedAction = { target: string; runs: number; failed: number; lastMessage: string | null; lastFailedAt: string | null }
export type ClientError = {
  fingerprint: string
  message: string
  route: string
  n: number
  firstAt: string | null
  lastAt: string | null
  deploy: string
  boundary: boolean
}

export type FrictionSummary = {
  counts: FrictionCounts
  rage: TargetCount[]
  quickBacks: QuickBackRow[]
  abandons: TargetCount[]
  flipflops: TargetCount[]
  failedActions: FailedAction[]
  errors: ClientError[]
}

export async function frictionSummary(f: ActivityFilters): Promise<FrictionSummary> {
  const [counts, rage, backs, abandons, flips, failed, errs] = await Promise.all([
    rows<{ kind: string; n: number }>(sql`
      select kind, count(*)::int as n from activity_events
      where module = 'frustration' and ${inWindow(f)} group by 1
    `),
    rows<{ route: string; target: string; n: number; median: unknown }>(sql`
      select route, target, count(*)::int as n,
        (percentile_cont(0.5) within group (order by (props->>'clicks')::float8))::float8 as median
      from activity_events where kind = 'frustration.rage' and ${inWindow(f)}
      group by 1, 2 order by n desc limit 12
    `),
    rows<{ route: string; to: string | null; n: number }>(sql`
      select route, props->>'to' as to, count(*)::int as n from activity_events
      where kind = 'frustration.quickback' and ${inWindow(f)} group by 1, 2
    `),
    rows<{ route: string; target: string; n: number; median: unknown }>(sql`
      select route, target, count(*)::int as n,
        (percentile_cont(0.5) within group (order by (props->>'chars')::float8))::float8 as median
      from activity_events where kind = 'frustration.abandon' and ${inWindow(f)}
      group by 1, 2 order by n desc limit 12
    `),
    rows<{ route: string; target: string; n: number; median: unknown }>(sql`
      select route, target, count(*)::int as n,
        (percentile_cont(0.5) within group (order by (props->>'gapMs')::float8))::float8 as median
      from activity_events where kind = 'frustration.flipflop' and ${inWindow(f)}
      group by 1, 2 order by n desc limit 12
    `),
    rows<Record<string, unknown>>(sql`
      select target, count(*)::int as runs, (count(*) filter (where ok = false))::int as failed,
        max(occurred_at) filter (where ok = false) as last_failed_at,
        (array_agg(props->>'message' order by occurred_at desc) filter (where ok = false))[1] as last_message
      from activity_events where kind = 'action.run' and ${inWindow(f)}
      group by target
      having count(*) filter (where ok = false) > 0
      order by failed desc limit 20
    `),
    rows<Record<string, unknown>>(sql`
      select props->>'fingerprint' as fingerprint,
        (array_agg(props->>'message' order by occurred_at desc))[1] as message,
        (array_agg(route order by occurred_at desc))[1] as route,
        (array_agg(deploy order by occurred_at desc))[1] as deploy,
        count(*)::int as n, min(occurred_at) as first_at, max(occurred_at) as last_at,
        coalesce(bool_or((props->>'boundary')::boolean), false) as boundary
      from activity_events where kind = 'error.client' and ${inWindow(f)}
      group by 1 order by n desc limit 20
    `),
  ])

  const count = (kind: string) => num(counts.find((c) => c.kind === kind)?.n)
  const toTarget = (r: { route: string; target: string; n: number; median: unknown }): TargetCount => ({
    route: r.route,
    target: r.target ?? "",
    n: num(r.n),
    median: maybeNum(r.median),
  })

  const backMap = new Map<string, QuickBackRow>()
  backs.forEach((b) => {
    const row = backMap.get(b.route) ?? { route: b.route, n: 0, topTo: null, topToN: 0 }
    row.n += num(b.n)
    if (num(b.n) > row.topToN) {
      row.topTo = b.to
      row.topToN = num(b.n)
    }
    backMap.set(b.route, row)
  })

  return {
    counts: {
      rage: count("frustration.rage"),
      quickback: count("frustration.quickback"),
      abandon: count("frustration.abandon"),
      flipflop: count("frustration.flipflop"),
    },
    rage: rage.map(toTarget),
    quickBacks: Array.from(backMap.values()).sort((a, b) => b.n - a.n).slice(0, 12),
    abandons: abandons.map(toTarget),
    flipflops: flips.map(toTarget),
    failedActions: failed.map((r) => ({
      target: String(r.target ?? ""),
      runs: num(r.runs),
      failed: num(r.failed),
      lastMessage: typeof r.last_message === "string" ? r.last_message : null,
      lastFailedAt: iso(r.last_failed_at),
    })),
    errors: errs.map((r) => ({
      fingerprint: String(r.fingerprint ?? ""),
      message: String(r.message ?? ""),
      route: String(r.route ?? "/"),
      n: num(r.n),
      firstAt: iso(r.first_at),
      lastAt: iso(r.last_at),
      deploy: String(r.deploy ?? ""),
      boundary: r.boundary === true,
    })),
  }
}
