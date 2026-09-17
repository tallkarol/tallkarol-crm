import { Empty, NUM, Name, Panel, RangeAxis, RangePlot, Scroll, TBODY, TD, TH, VitalCell } from "@/components/activity/bits"
import { DeployCompare, type DeployOption } from "@/components/activity/DeployCompare"
import { formatCls, formatCount, formatMs, humanizeId, vitalRating } from "@/lib/activity/format"
import { routeLabel } from "@/lib/activity/routes"
import type { ActivityFilters } from "@/lib/activity/summary/filters"
import { MIN_SAMPLES, actionTimings, deployComparisons, pageSpeed, type DeployComparison } from "@/lib/activity/summary/speed"
import { cn } from "@/lib/cn"

function when(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz })
}

function change(after: number | null, before: number | null, enough: boolean, unit: (v: number) => string): { detail: string; tone: "good" | "bad" | "" } {
  if (!enough || after === null) return { detail: "", tone: "" }
  if (before === null) return { detail: "nothing to compare before it", tone: "" }
  const diff = after - before
  if (Math.abs(diff) < 1) return { detail: `was ${unit(before)} · no change`, tone: "" }
  return { detail: `was ${unit(before)} · ${unit(Math.abs(diff))} ${diff < 0 ? "faster" : "slower"}`, tone: diff < 0 ? "good" : "bad" }
}

function deployOption(d: DeployComparison, tz: string): DeployOption {
  const a = d.after
  const b = d.before
  const top = d.topAction ? humanizeId(d.topAction) : "Busiest action"
  const topEnough = a.topRuns >= MIN_SAMPLES.actionRuns
  const readyEnough = a.views >= MIN_SAMPLES.views
  const inpEnough = a.inpN >= MIN_SAMPLES.inp
  const topChange = change(a.topP95, b.topRuns >= MIN_SAMPLES.actionRuns ? b.topP95 : null, topEnough, formatMs)
  const readyChange = change(a.readyP75, b.views >= MIN_SAMPLES.views ? b.readyP75 : null, readyEnough, formatMs)
  const inpChange = change(a.inpP75, b.inpN >= MIN_SAMPLES.inp ? b.inpP75 : null, inpEnough, formatMs)
  return {
    deploy: d.deploy,
    title: `${d.deploy} · ${d.until ? `${when(d.firstAt, tz)} – ${when(d.until, tz)}` : `live since ${when(d.firstAt, tz)}`}`,
    note: "compared with the 7 days before it went live",
    cells: [
      {
        label: `${top} · p95`,
        value: topEnough ? formatMs(a.topP95) : "—",
        detail: topEnough ? topChange.detail : `${a.topRuns} runs · needs ${MIN_SAMPLES.actionRuns}`,
        tone: topChange.tone,
      },
      {
        label: "Ready after a click · p75",
        value: readyEnough ? formatMs(a.readyP75) : "—",
        detail: readyEnough ? readyChange.detail : `${a.views} visits · needs ${MIN_SAMPLES.views}`,
        tone: readyChange.tone,
      },
      {
        label: "INP · p75",
        value: inpEnough ? formatMs(a.inpP75) : "—",
        detail: inpEnough ? inpChange.detail : `${a.inpN} readings · needs ${MIN_SAMPLES.inp}`,
        tone: inpChange.tone,
      },
      {
        label: "Client errors",
        value: formatCount(a.errors),
        detail: `was ${b.errors} in the 7 days before`,
        tone: a.errors > b.errors ? "bad" : a.errors < b.errors ? "good" : "",
      },
    ],
  }
}

export async function SpeedView({ f }: { f: ActivityFilters }) {
  const [actions, pages] = await Promise.all([actionTimings(f), pageSpeed(f)])
  const busiest = actions.slice().sort((a, b) => b.runs - a.runs)[0]?.target ?? null
  const deploys = await deployComparisons(f, busiest)

  return (
    <>
      <Panel
        title="Where you wait"
        sub={
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-full" style={{ background: "var(--chart-teal)" }} />
              median
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-full border-2" style={{ borderColor: "var(--chart-teal)" }} />
              p95
            </span>
            <span>sorted by total time waited</span>
          </span>
        }
        flush
      >
        {actions.length ? (
          <Scroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Action</th>
                  <th className={cn(TH, "text-right")}>Runs</th>
                  <th className={cn(TH, "text-right")}>Median</th>
                  <th className={cn(TH, "text-right")}>p95</th>
                  <th className={cn(TH, "text-right")}>Waited</th>
                  <th className={cn(TH, "min-w-[200px]")}>
                    <RangeAxis />
                  </th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {actions.map((a, i) => (
                  <tr key={a.target}>
                    <td className={TD}>
                      <Name title={humanizeId(a.target)} id={a.target} />
                    </td>
                    <td className={cn(TD, NUM)}>{formatCount(a.runs)}</td>
                    <td className={cn(TD, NUM)}>{formatMs(a.p50Ms)}</td>
                    <td className={cn(TD, NUM)}>{formatMs(a.p95Ms)}</td>
                    <td className={cn(TD, NUM, i === 0 && "font-semibold text-ink")}>{formatMs(a.waitedMs)}</td>
                    <td className={TD}>
                      <RangePlot p50={a.p50Ms} p95={a.p95Ms} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        ) : (
          <Empty>No timed server actions in this window. Actions report timing once they are wrapped in tracked().</Empty>
        )}
      </Panel>

      <Panel title="Pages: ready and web vitals" sub="p75 · Google's thresholds · the local dev server is left out" flush>
        {pages.length ? (
          <Scroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Page</th>
                  <th className={cn(TH, "text-right")}>Ready after a click</th>
                  <th className={cn(TH, "text-right")}>LCP</th>
                  <th className={cn(TH, "text-right")}>INP</th>
                  <th className={cn(TH, "text-right")}>CLS</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {pages.map((p) => (
                  <tr key={p.route}>
                    <td className={TD}>
                      <Name title={routeLabel(p.route)} id={`${formatCount(p.views)} views · ${formatCount(p.vitals)} vitals readings`} />
                    </td>
                    <td className={cn(TD, NUM)}>{formatMs(p.readyP75)}</td>
                    <td className={cn(TD, "text-right")}>
                      <VitalCell value={p.lcp} rating={vitalRating("lcp", p.lcp)} text={formatMs(p.lcp)} />
                    </td>
                    <td className={cn(TD, "text-right")}>
                      <VitalCell value={p.inp} rating={vitalRating("inp", p.inp)} text={formatMs(p.inp)} />
                    </td>
                    <td className={cn(TD, "text-right")}>
                      <VitalCell value={p.cls} rating={vitalRating("cls", p.cls)} text={formatCls(p.cls)} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="border-t border-line px-5 py-2.5 font-ui text-[11.5px] text-ink-3">
                    LCP and CLS come from full loads (opening the Mac app, a reload). INP and &ldquo;ready after a click&rdquo; come from every visit.
                  </td>
                </tr>
              </tfoot>
            </table>
          </Scroll>
        ) : (
          <Empty>No page timings in this window.</Empty>
        )}
      </Panel>

      <Panel title="Before and after a deploy" flush>
        {deploys.length ? (
          <DeployCompare options={deploys.map((d) => deployOption(d, f.tz))} />
        ) : (
          <Empty>No deploy has recorded anything yet. Each event carries the commit it ran on, so this fills itself after the next deploy.</Empty>
        )}
      </Panel>
    </>
  )
}
