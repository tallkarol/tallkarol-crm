import { sql } from "drizzle-orm"
import { CATALOG, type CatalogControl } from "@/lib/activity/catalog"
import { inWindow, iso, maybeNum, num, rows, ts, type ActivityFilters } from "@/lib/activity/summary/filters"

export type ControlRow = {
  route: string
  target: string
  uses: number
  lastAt: string | null
  /** The most-chosen values, when the control has any. */
  values: { value: string; n: number }[]
}

export type ControlsSummary = {
  rows: ControlRow[]
  viewsByRoute: Record<string, number>
  /** Catalogued controls with no use in 30 days. */
  unused: CatalogControl[]
  catalogCount: number
  /** Distinct routes the catalogued controls were seen on. */
  instrumentedPages: number
}

export async function controlsSummary(f: ActivityFilters): Promise<ControlsSummary> {
  const since30 = new Date(f.now.getTime() - 30 * 86_400_000)
  const [uses, values, views, used30] = await Promise.all([
    rows<{ route: string; target: string; n: number; last_at: unknown }>(sql`
      select route, target, count(*)::int as n, max(occurred_at) as last_at
      from activity_events
      where kind = 'control.use' and target is not null and ${inWindow(f)}
      group by 1, 2
    `),
    rows<{ route: string; target: string; value: string; n: number }>(sql`
      select route, target, props->>'value' as value, count(*)::int as n
      from activity_events
      where kind = 'control.use' and props ? 'value' and ${inWindow(f)}
      group by 1, 2, 3
    `),
    rows<{ route: string; n: number }>(sql`
      select route, count(*)::int as n
      from activity_events
      where kind = 'page.view' and ${inWindow(f)}
      group by 1
    `),
    rows<{ target: string }>(sql`
      select distinct target
      from activity_events
      where kind = 'control.use' and synthetic = false and occurred_at >= ${ts(since30)} and target is not null
    `),
  ])

  const valueMap = new Map<string, { value: string; n: number }[]>()
  values.forEach((v) => {
    const key = `${v.route}|${v.target}`
    const list = valueMap.get(key) ?? []
    list.push({ value: v.value, n: num(v.n) })
    valueMap.set(key, list)
  })

  const viewsByRoute: Record<string, number> = {}
  views.forEach((v) => (viewsByRoute[v.route] = num(v.n)))

  const seen = new Set(used30.map((u) => u.target))
  const matchesCatalog = (id: string, target: string) =>
    id.includes("*") ? new RegExp(`^${id.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".+")}$`).test(target) : id === target
  const unused = CATALOG.controls.filter((c) => !Array.from(seen).some((t) => matchesCatalog(c.id, t)))

  return {
    rows: uses
      .map((u) => ({
        route: u.route,
        target: u.target,
        uses: num(u.n),
        lastAt: iso(u.last_at),
        values: (valueMap.get(`${u.route}|${u.target}`) ?? []).sort((a, b) => b.n - a.n).slice(0, 3),
      }))
      .sort((a, b) => a.route.localeCompare(b.route) || b.uses - a.uses),
    viewsByRoute,
    unused,
    catalogCount: CATALOG.controls.length,
    instrumentedPages: new Set(uses.map((u) => u.route)).size,
  }
}

export type PeekRow = { peek: string; opens: number; closes: number; acted: number; medianOpenMs: number | null }

export async function peekRows(f: ActivityFilters): Promise<PeekRow[]> {
  const result = await rows<Record<string, unknown>>(sql`
    select props->>'peek' as peek,
      (count(*) filter (where kind = 'peek.open'))::int as opens,
      (count(*) filter (where kind = 'peek.close'))::int as closes,
      (count(*) filter (where kind = 'peek.close' and (props->>'acted')::boolean))::int as acted,
      (percentile_cont(0.5) within group (order by duration_ms) filter (where kind = 'peek.close'))::float8 as median_ms
    from activity_events
    where module = 'peeks' and ${inWindow(f)}
    group by 1
  `)
  return result
    .map((r) => ({
      peek: String(r.peek ?? "unknown"),
      opens: num(r.opens),
      closes: num(r.closes),
      acted: num(r.acted),
      medianOpenMs: maybeNum(r.median_ms),
    }))
    .sort((a, b) => b.opens - a.opens)
}
