import { Empty, NUM, Name, Panel, Pill, Scroll, Spark, TBODY, TD, TH } from "@/components/activity/bits"
import { NextPages, type FlowOption } from "@/components/activity/NextPages"
import { formatActive, formatAge, formatCount, formatMs, formatShare } from "@/lib/activity/format"
import { routeLabel } from "@/lib/activity/routes"
import type { ActivityFilters } from "@/lib/activity/summary/filters"
import type { HeaderFacts } from "@/lib/activity/summary/overview"
import { nextPages, pageRows, sidebarUse } from "@/lib/activity/summary/pages"
import { cn } from "@/lib/cn"

const SHOWN = 25

export async function PagesView({ f, facts }: { f: ActivityFilters; facts: HeaderFacts }) {
  const [pages, sidebar] = await Promise.all([pageRows(f), sidebarUse()])
  const flows = await nextPages(f, pages.slice(0, 6).map((p) => p.route))
  const shown = pages.slice(0, SHOWN)
  const rest = pages.slice(SHOWN)
  const since30 = f.now.getTime() - 30 * 86_400_000
  const unopened = sidebar
    .filter((row) => !row.lastAt || new Date(row.lastAt).getTime() < since30)
    .sort((a, b) => (a.lastAt ?? "").localeCompare(b.lastAt ?? ""))

  const flowOptions: FlowOption[] = flows.map((flow) => ({
    from: flow.from,
    label: routeLabel(flow.from),
    total: flow.total,
    next: flow.next.map((step) => ({ label: step.route ? routeLabel(step.route) : "Left the CRM", n: step.n, out: step.route === null })),
  }))

  return (
    <>
      <Panel title="Pages by active time" sub={`grouped by route · ${pages.length} ${pages.length === 1 ? "route" : "routes"} visited`} flush>
        {shown.length ? (
          <Scroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Page</th>
                  <th className={cn(TH, "text-right")}>Views</th>
                  <th className={cn(TH, "text-right")}>Active</th>
                  <th className={cn(TH, "text-right")}>Median visit</th>
                  <th className={cn(TH, "text-right")}>Phone</th>
                  <th className={cn(TH, "text-right")}>Quick backs</th>
                  <th className={TH}>Views per day</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {shown.map((p) => {
                  const phoneShare = p.views ? p.phone / p.views : 0
                  const backShare = p.views ? p.quickBacks / p.views : 0
                  return (
                    <tr key={p.route}>
                      <td className={TD}>
                        <Name title={routeLabel(p.route)} id={p.route} />
                      </td>
                      <td className={cn(TD, NUM)}>{formatCount(p.views)}</td>
                      <td className={cn(TD, NUM)}>{formatActive(p.activeMs)}</td>
                      <td className={cn(TD, NUM)}>{formatMs(p.medianVisitMs)}</td>
                      <td className={cn(TD, NUM)}>
                        {phoneShare >= 0.5 && p.views >= 10 ? <Pill tone="teal" dot={false}>{formatShare(p.phone, p.views)}</Pill> : formatShare(p.phone, p.views)}
                      </td>
                      <td className={cn(TD, NUM)}>
                        {backShare >= 0.2 && p.quickBacks >= 5 ? <Pill tone="warn" dot={false}>{p.quickBacks}</Pill> : p.quickBacks}
                      </td>
                      <td className={TD}>
                        <Spark values={p.perDay} label={`Views per day: ${p.perDay.join(", ")}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {rest.length ? (
                <tfoot>
                  <tr>
                    <td colSpan={7} className="border-t border-line px-5 py-2.5 font-ui text-[11.5px] text-ink-3">
                      {rest.length} more {rest.length === 1 ? "route" : "routes"} · {formatCount(rest.reduce((n, p) => n + p.views, 0))} views ·{" "}
                      {formatActive(rest.reduce((n, p) => n + p.activeMs, 0))} active
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </Scroll>
        ) : (
          <Empty>No page views in this window.</Empty>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Sidebar rows not opened in 30 days"
          sub={facts.trackedDays < 30 ? `recording for ${facts.trackedDays} ${facts.trackedDays === 1 ? "day" : "days"} — read this after 30` : "checked against lib/nav.ts"}
        >
          {unopened.length ? (
            <ul className="flex flex-col">
              {unopened.map((row) => (
                <li key={row.href} className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-[12.5px] text-ink-2 first:border-t-0 first:pt-0.5">
                  <b className="font-semibold text-ink">{row.label}</b>
                  <span className="whitespace-nowrap font-ui text-[11.5px] text-ink-3">
                    {row.lastAt ? `last opened ${formatAge(row.lastAt, f.now, f.tz)}` : "no visit since recording began"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-3">Every sidebar row was opened in the last 30 days.</p>
          )}
        </Panel>
        <Panel title="Where you go next" sub="the next page in the same session">
          {flowOptions.length ? <NextPages flows={flowOptions} /> : <p className="text-[12.5px] text-ink-3">Needs a few sessions with more than one page.</p>}
        </Panel>
      </div>
    </>
  )
}
