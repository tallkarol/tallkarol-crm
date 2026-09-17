import { Fragment } from "react"
import { Code, Empty, Meter, NUM, Name, Panel, Pill, Scroll, TBODY, TD, TH } from "@/components/activity/bits"
import { CATALOG } from "@/lib/activity/catalog"
import { formatAge, formatCount, formatMs, humanizeId } from "@/lib/activity/format"
import { routeLabel } from "@/lib/activity/routes"
import { controlsSummary, peekRows } from "@/lib/activity/summary/controls"
import type { ActivityFilters } from "@/lib/activity/summary/filters"
import { cn } from "@/lib/cn"

export async function ControlsView({ f }: { f: ActivityFilters }) {
  const [c, peeks] = await Promise.all([controlsSummary(f), peekRows(f)])
  const labelOf = (id: string) => CATALOG.controls.find((ctl) => ctl.id === id)?.label ?? humanizeId(id)

  const byRoute = new Map<string, typeof c.rows>()
  c.rows.forEach((row) => byRoute.set(row.route, [...(byRoute.get(row.route) ?? []), row]))
  const routes = Array.from(byRoute.keys()).sort((a, b) => (c.viewsByRoute[b] ?? 0) - (c.viewsByRoute[a] ?? 0))
  const peekOpens = peeks.reduce((n, p) => n + p.opens, 0)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="teal" dot={false}>
          {c.catalogCount} {c.catalogCount === 1 ? "control" : "controls"} in the catalog
        </Pill>
        <Pill tone="muted" dot={false}>
          {c.unused.length} with no uses in 30 days
        </Pill>
        <Pill tone="muted" dot={false}>
          {CATALOG.actions.wrapped} of {CATALOG.actions.total} server actions timed
        </Pill>
        <span className="font-ui text-[11.5px] text-ink-3">
          catalog from <Code>npm run activity:scan</Code>, which also runs before every build
        </span>
      </div>

      <Panel title="Controls by page" sub="uses in this window · per visit = uses ÷ visits to that page" flush>
        {c.rows.length || c.unused.length ? (
          <Scroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Control</th>
                  <th className={cn(TH, "text-right")}>Uses</th>
                  <th className={TH}>Per visit</th>
                  <th className={TH}>Values</th>
                  <th className={cn(TH, "text-right")}>Last used</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {routes.map((route) => (
                  <Fragment key={route}>
                    <tr>
                      <td colSpan={5} className="border-b border-line bg-well px-5 py-2 font-ui text-[11.5px] font-bold text-ink">
                        {routeLabel(route)}
                        <span className="ml-2 font-mono text-[11px] font-medium text-ink-3">{formatCount(c.viewsByRoute[route] ?? 0)} visits</span>
                      </td>
                    </tr>
                    {(byRoute.get(route) ?? []).map((row) => (
                      <tr key={`${route}|${row.target}`}>
                        <td className={TD}>
                          <Name title={labelOf(row.target)} id={row.target} />
                        </td>
                        <td className={cn(TD, NUM)}>{formatCount(row.uses)}</td>
                        <td className={TD}>
                          <Meter part={row.uses} whole={c.viewsByRoute[route] ?? 0} />
                        </td>
                        <td className={cn(TD, "font-mono text-[11.5px]")}>
                          {row.values.length ? row.values.map((v) => `${v.value} ${v.n}`).join(" · ") : <span className="text-ink-3">—</span>}
                        </td>
                        <td className={cn(TD, NUM)}>{formatAge(row.lastAt, f.now, f.tz)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {c.unused.length ? (
                  <>
                    <tr>
                      <td colSpan={5} className="border-b border-line bg-well px-5 py-2 font-ui text-[11.5px] font-bold text-ink">
                        No uses in 30 days
                        <span className="ml-2 font-mono text-[11px] font-medium text-ink-3">{c.unused.length} in the catalog</span>
                      </td>
                    </tr>
                    {c.unused.map((ctl) => (
                      <tr key={ctl.id} className="text-ink-3">
                        <td className={TD}>
                          <Name title={ctl.label ?? humanizeId(ctl.id)} id={ctl.id} />
                        </td>
                        <td className={cn(TD, NUM)}>0</td>
                        <td className={TD}>—</td>
                        <td className={cn(TD, "font-mono text-[11px] text-ink-3")}>{ctl.file}</td>
                        <td className={cn(TD, NUM)}>
                          <Pill tone="muted" dot={false}>
                            none in 30 days
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </>
                ) : null}
              </tbody>
            </table>
          </Scroll>
        ) : (
          <Empty>
            {c.catalogCount
              ? "No control was used in this window."
              : "No controls are marked yet. Give one a data-track attribute naming it (page.control), then run npm run activity:scan."}
          </Empty>
        )}
      </Panel>

      <Panel title="Peek cards" sub={`${formatCount(peekOpens)} opens · "acted" = a button inside was pressed before it closed`} flush>
        {peeks.length ? (
          <Scroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Peek</th>
                  <th className={cn(TH, "text-right")}>Opens</th>
                  <th className={TH}>Acted inside</th>
                  <th className={cn(TH, "text-right")}>Median open</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {peeks.map((p) => (
                  <tr key={p.peek}>
                    <td className={TD}>
                      <Name title={p.peek.charAt(0).toUpperCase() + p.peek.slice(1)} id={`?peek=${p.peek}:…`} />
                    </td>
                    <td className={cn(TD, NUM)}>{formatCount(p.opens)}</td>
                    <td className={TD}>
                      <Meter part={p.acted} whole={p.closes} />
                    </td>
                    <td className={cn(TD, NUM)}>{formatMs(p.medianOpenMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        ) : (
          <Empty>No peek card was opened in this window.</Empty>
        )}
      </Panel>
    </>
  )
}
