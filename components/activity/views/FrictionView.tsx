import type { ReactNode } from "react"
import { Empty, NUM, Name, Panel, Pill, Scroll, TBODY, TD, TH } from "@/components/activity/bits"
import { QUICK_BACK_MS, RAGE } from "@/lib/activity/detect"
import { formatAge, formatCount, formatMs, humanizeId } from "@/lib/activity/format"
import { routeLabel } from "@/lib/activity/routes"
import type { ActivityFilters } from "@/lib/activity/summary/filters"
import { frictionSummary } from "@/lib/activity/summary/friction"
import { cn } from "@/lib/cn"

function Count({ label, value, rule }: { label: string; value: number; rule: string }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3.5">
      <div className="font-ui text-[11.5px] font-semibold text-ink-3">{label}</div>
      <div className="mt-1 font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">{formatCount(value)}</div>
      <div className="mt-1 font-ui text-[11.5px] font-semibold text-ink-3">{rule}</div>
    </div>
  )
}

function Rows({ items, empty }: { items: { key: string; what: ReactNode; where: ReactNode; n: number }[]; empty: string }) {
  if (!items.length) return <p className="text-[12.5px] text-ink-3">{empty}</p>
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
          <span className="min-w-0">
            <span className="block truncate font-ui text-[13px] font-semibold text-ink">{item.what}</span>
            <span className="block truncate font-ui text-[11.5px] text-ink-3">{item.where}</span>
          </span>
          <span className="font-display text-[18px] font-semibold tabular-nums tracking-tight text-ink">{item.n}</span>
        </li>
      ))}
    </ul>
  )
}

export async function FrictionView({ f }: { f: ActivityFilters }) {
  const s = await frictionSummary(f)
  const target = (id: string) => (id.includes("›") ? id : humanizeId(id))

  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card lg:grid-cols-4">
        <Count label="Rage clicks" value={s.counts.rage} rule={`${RAGE.clicks}+ clicks on one thing within ${RAGE.windowMs / 1000} s`} />
        <Count label="Quick backs" value={s.counts.quickback} rule={`Back within ${QUICK_BACK_MS / 1000} s of arriving`} />
        <Count label="Abandoned inputs" value={s.counts.abandon} rule="Typed, then left without sending" />
        <Count label="Flip-flops" value={s.counts.flipflop} rule="Set, then set back within 60 s" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Rage clicks" sub="by element">
          <Rows
            empty="No rage clicks in this window."
            items={s.rage.map((r) => ({ key: `${r.route}|${r.target}`, what: target(r.target), where: `${routeLabel(r.route)} · ${r.target}`, n: r.n }))}
          />
        </Panel>
        <Panel title="Quick backs" sub="by page left">
          <Rows
            empty="Nobody bounced straight back in this window."
            items={s.quickBacks.map((q) => ({
              key: q.route,
              what: routeLabel(q.route),
              where: q.topTo ? `mostly back to ${routeLabel(q.topTo)}` : "back",
              n: q.n,
            }))}
          />
        </Panel>
        <Panel title="Abandoned inputs" sub="length only, never the text">
          <Rows
            empty="No typed-and-abandoned fields in this window."
            items={s.abandons.map((a) => ({
              key: `${a.route}|${a.target}`,
              what: `${routeLabel(a.route)} · ${target(a.target)}`,
              where: a.median !== null ? `median ${Math.round(a.median)} characters typed` : a.target,
              n: a.n,
            }))}
          />
        </Panel>
        <Panel title="Flip-flops" sub="changed, then changed back">
          <Rows
            empty="No flip-flops in this window."
            items={s.flipflops.map((x) => ({
              key: `${x.route}|${x.target}`,
              what: `${routeLabel(x.route)} · ${target(x.target)}`,
              where: x.median !== null ? `median ${formatMs(x.median)} between the two changes` : x.target,
              n: x.n,
            }))}
          />
        </Panel>
      </div>

      <Panel title="Failed actions" sub="the message is the one the action returned" flush>
        {s.failedActions.length ? (
          <Scroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Action</th>
                  <th className={cn(TH, "text-right")}>Failed</th>
                  <th className={cn(TH, "text-right")}>Runs</th>
                  <th className={TH}>Last message</th>
                  <th className={cn(TH, "text-right")}>Last</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {s.failedActions.map((a) => (
                  <tr key={a.target}>
                    <td className={TD}>
                      <Name title={humanizeId(a.target)} id={a.target} />
                    </td>
                    <td className={cn(TD, NUM)}>
                      <Pill tone="bad" dot={false}>
                        {a.failed}
                      </Pill>
                    </td>
                    <td className={cn(TD, NUM)}>{formatCount(a.runs)}</td>
                    <td className={cn(TD, "font-mono text-[11.5px] text-ink")}>{a.lastMessage || <span className="text-ink-3">threw without a message</span>}</td>
                    <td className={cn(TD, NUM)}>{formatAge(a.lastFailedAt, f.now, f.tz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        ) : (
          <Empty>No server action failed in this window.</Empty>
        )}
      </Panel>

      <Panel title="Client errors" sub="grouped by message and top stack frame" flush>
        {s.errors.length ? (
          <Scroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Error</th>
                  <th className={TH}>Page</th>
                  <th className={cn(TH, "text-right")}>Events</th>
                  <th className={cn(TH, "text-right")}>First seen</th>
                  <th className={cn(TH, "text-right")}>Deploy</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {s.errors.map((e) => (
                  <tr key={e.fingerprint}>
                    <td className={cn(TD, "font-mono text-[11.5px] text-ink")}>
                      {e.message}
                      {e.boundary ? <span className="ml-2 font-ui text-[11px] font-semibold text-bad">showed the error page</span> : null}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>{routeLabel(e.route)}</td>
                    <td className={cn(TD, NUM)}>{formatCount(e.n)}</td>
                    <td className={cn(TD, NUM)}>{formatAge(e.firstAt, f.now, f.tz)}</td>
                    <td className={cn(TD, NUM, "font-mono text-[11px]")}>{e.deploy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        ) : (
          <Empty>No client errors in this window.</Empty>
        )}
      </Panel>
    </>
  )
}
