import { sql } from "drizzle-orm"
import { navRows, underHref } from "@/lib/activity/routes"
import { inWindow, iso, maybeNum, num, rows, windowDayKeys, type ActivityFilters } from "@/lib/activity/summary/filters"

export type PageRow = {
  route: string
  views: number
  activeMs: number
  medianVisitMs: number | null
  phone: number
  quickBacks: number
  perDay: number[]
}

export async function pageRows(f: ActivityFilters): Promise<PageRow[]> {
  const days = windowDayKeys(f)
  const dayIndex = new Map(days.map((d, i) => [d, i] as const))
  const [views, visits, backs] = await Promise.all([
    rows<{ route: string; day: string; n: number; phone: number }>(sql`
      select route, to_char(occurred_at at time zone ${f.tz}, 'YYYY-MM-DD') as day,
        count(*)::int as n, (count(*) filter (where surface = 'phone'))::int as phone
      from activity_events
      where kind = 'page.view' and ${inWindow(f)}
      group by 1, 2
    `),
    rows<{ route: string; active_ms: unknown; median_ms: unknown }>(sql`
      with visits as (
        select route, props->>'view' as view, sum(duration_ms)::float8 as ms
        from activity_events
        where kind = 'page.leave' and ${inWindow(f)}
        group by 1, 2
      )
      select route, sum(ms)::float8 as active_ms, (percentile_cont(0.5) within group (order by ms))::float8 as median_ms
      from visits
      group by route
    `),
    rows<{ route: string; n: number }>(sql`
      select route, count(*)::int as n
      from activity_events
      where kind = 'frustration.quickback' and ${inWindow(f)}
      group by 1
    `),
  ])

  const byRoute = new Map<string, PageRow>()
  const row = (route: string) => {
    let r = byRoute.get(route)
    if (!r) {
      r = { route, views: 0, activeMs: 0, medianVisitMs: null, phone: 0, quickBacks: 0, perDay: days.map(() => 0) }
      byRoute.set(route, r)
    }
    return r
  }
  views.forEach((v) => {
    const r = row(v.route)
    r.views += num(v.n)
    r.phone += num(v.phone)
    const i = dayIndex.get(v.day)
    if (i !== undefined) r.perDay[i] += num(v.n)
  })
  visits.forEach((v) => {
    const r = row(v.route)
    r.activeMs = num(v.active_ms)
    r.medianVisitMs = maybeNum(v.median_ms)
  })
  backs.forEach((b) => {
    row(b.route).quickBacks = num(b.n)
  })
  return Array.from(byRoute.values()).sort((a, b) => b.activeMs - a.activeMs || b.views - a.views)
}

export type NavRowUse = { href: string; label: string; lastAt: string | null }

/**
 * Every sidebar row with the last time anything under it was opened (all
 * time, real traffic, admin only — customers never see the sidebar).
 */
export async function sidebarUse(): Promise<NavRowUse[]> {
  const last = await rows<{ route: string; last_at: unknown }>(sql`
    select route, max(occurred_at) as last_at
    from activity_events
    where kind = 'page.view' and synthetic = false and role = 'admin'
    group by route
  `)
  return navRows().map((nav) => {
    let lastAt: string | null = null
    last.forEach((r) => {
      if (!underHref(r.route, nav.href)) return
      const at = iso(r.last_at)
      if (at && (!lastAt || at > lastAt)) lastAt = at
    })
    return { href: nav.href, label: nav.label, lastAt }
  })
}

export type NextStep = { route: string | null; n: number }
export type NextPages = { from: string; total: number; next: NextStep[] }[]

/** What came next in the same session; null = the session ended or went quiet for 30 minutes. */
export async function nextPages(f: ActivityFilters, fromRoutes: string[]): Promise<NextPages> {
  if (!fromRoutes.length) return []
  const result = await rows<{ route: string; next_route: string | null; gap: unknown }>(sql`
    select route,
      lead(route) over (partition by session order by occurred_at) as next_route,
      extract(epoch from (lead(occurred_at) over (partition by session order by occurred_at) - occurred_at))::float8 as gap
    from activity_events
    where kind = 'page.view' and ${inWindow(f)}
  `)
  const wanted = new Set(fromRoutes)
  const counts = new Map<string, Map<string | null, number>>()
  result.forEach((r) => {
    if (!wanted.has(r.route)) return
    const gone = r.next_route === null || num(r.gap) > 30 * 60
    const key = gone ? null : r.next_route
    const m = counts.get(r.route) ?? new Map<string | null, number>()
    m.set(key, (m.get(key) ?? 0) + 1)
    counts.set(r.route, m)
  })
  return fromRoutes
    .filter((route) => counts.has(route))
    .map((route) => {
      const m = counts.get(route) ?? new Map<string | null, number>()
      const next: NextStep[] = []
      m.forEach((n, key) => next.push({ route: key, n }))
      next.sort((a, b) => b.n - a.n)
      return { from: route, total: next.reduce((sum, s) => sum + s.n, 0), next }
    })
}
