import { sql } from "drizzle-orm"
import { iso, num, rows, sliceSql, type ActivityFilters } from "@/lib/activity/summary/filters"

export type StreamEvent = {
  id: number
  at: string
  session: string
  surface: string
  role: string
  client: string | null
  module: string
  kind: string
  route: string
  target: string | null
  durationMs: number | null
  ok: boolean | null
  props: Record<string, unknown>
  deploy: string
  synthetic: boolean
}

/**
 * The newest events, or those after `afterId` for the live poll. The whole
 * stored row is returned — what the Stream expands is everything there is.
 */
export async function streamEvents(
  f: Pick<ActivityFilters, "surface" | "who" | "test">,
  opts: { afterId?: number; limit?: number } = {}
): Promise<StreamEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 150, 1), 300)
  const after = opts.afterId && Number.isFinite(opts.afterId) ? sql`e.id > ${opts.afterId}` : sql`true`
  const result = await rows<Record<string, unknown>>(sql`
    select e.id, e.occurred_at, e.session, e.surface, e.role, c.name as client, e.module, e.kind, e.route,
      e.target, e.duration_ms, e.ok, e.props, e.deploy, e.synthetic
    from activity_events e
    left join clients c on c.id = e.client_id
    where ${after} and ${sliceSql(f)}
    order by e.id desc
    limit ${limit}
  `)
  return result.map((r) => ({
    id: num(r.id),
    at: iso(r.occurred_at) ?? new Date(0).toISOString(),
    session: String(r.session ?? ""),
    surface: String(r.surface ?? ""),
    role: String(r.role ?? ""),
    client: typeof r.client === "string" ? r.client : null,
    module: String(r.module ?? ""),
    kind: String(r.kind ?? ""),
    route: String(r.route ?? "/"),
    target: typeof r.target === "string" ? r.target : null,
    durationMs: r.duration_ms === null || r.duration_ms === undefined ? null : num(r.duration_ms),
    ok: typeof r.ok === "boolean" ? r.ok : null,
    props: r.props && typeof r.props === "object" ? (r.props as Record<string, unknown>) : {},
    deploy: String(r.deploy ?? ""),
    synthetic: r.synthetic === true,
  }))
}
