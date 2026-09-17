import Link from "next/link"
import { ActiveChart } from "@/components/activity/ActiveChart"
import { Chip, Empty, Panel, Scroll, TBODY, TD, TH, NUM } from "@/components/activity/bits"
import { HeatChart } from "@/components/activity/HeatChart"
import { waitingLine } from "@/lib/activity/findings"
import { formatActive, formatCount } from "@/lib/activity/format"
import { routeLabel } from "@/lib/activity/routes"
import type { ActivityFilters } from "@/lib/activity/summary/filters"
import { activeByDay, heat, readings, viaByRoute, type HeaderFacts, type Readings } from "@/lib/activity/summary/overview"
import { tuningNotes } from "@/lib/activity/summary/tuning"
import { cn } from "@/lib/cn"

const VIA_COLUMNS = [
  ["sidebar", "Sidebar"],
  ["palette", "⌘K"],
  ["link", "Link on a page"],
  ["peek", "Peek card"],
  ["back", "Back"],
  ["outside", "From outside"],
] as const

function dayLabel(key: string) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })
}

function Reading({ label, value, delta, tone }: { label: string; value: string; delta: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3.5 last:col-span-2 lg:last:col-span-1">
      <div className="font-ui text-[11.5px] font-semibold text-ink-3">{label}</div>
      <div className="mt-1 whitespace-nowrap font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">{value}</div>
      <div className={cn("mt-1 font-ui text-[11.5px] font-semibold", tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink-3")}>{delta}</div>
    </div>
  )
}

function readingDeltas(cur: Readings, prev: Readings, days: number) {
  const before = `the ${days} days before`
  const hasPrev = prev.views + prev.activeMs + prev.actions > 0
  const active = !hasPrev
    ? "no earlier days to compare"
    : `${cur.activeMs >= prev.activeMs ? "+" : "−"}${formatActive(Math.abs(cur.activeMs - prev.activeMs))} on ${before}`
  const views = !hasPrev || !prev.views ? "no earlier days to compare" : `${cur.views >= prev.views ? "+" : "−"}${Math.abs(Math.round(((cur.views - prev.views) / prev.views) * 100))}% on ${before}`
  const frictionDiff = cur.friction - prev.friction
  const friction = !hasPrev
    ? "no earlier days to compare"
    : frictionDiff === 0
      ? `same as ${before}`
      : `${Math.abs(frictionDiff)} ${frictionDiff < 0 ? "fewer" : "more"} than ${before}`
  return { active, views, friction, frictionTone: hasPrev && frictionDiff !== 0 ? (frictionDiff < 0 ? ("good" as const) : ("bad" as const)) : undefined }
}

export async function OverviewView({
  f,
  facts,
  hrefFor,
}: {
  f: ActivityFilters
  facts: HeaderFacts
  hrefFor: (view: string) => string
}) {
  const [r, days, grid, via] = await Promise.all([readings(f), activeByDay(f), heat(f), viaByRoute(f)])
  const notes = await tuningNotes(f, facts, via).catch((err) => {
    console.error("activity: tuning notes failed:", err)
    return null
  })
  const d = readingDeltas(r.cur, r.prev, f.days)
  const waiting = notes ? waitingLine(notes.waiting) : null
  const topVia = via.slice(0, 8)

  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card lg:grid-cols-5">
        <Reading label="Active time" value={formatActive(r.cur.activeMs)} delta={d.active} />
        <Reading label="Page views" value={formatCount(r.cur.views)} delta={d.views} />
        <Reading label="Actions run" value={formatCount(r.cur.actions)} delta={r.cur.failed ? `${r.cur.failed} failed` : "none failed"} tone={r.cur.failed ? "bad" : undefined} />
        <Reading label="Friction signals" value={formatCount(r.cur.friction)} delta={d.friction} tone={d.frictionTone} />
        <Reading
          label="Client errors"
          value={formatCount(r.cur.errors)}
          delta={r.cur.errors ? `${r.cur.errorKinds} ${r.cur.errorKinds === 1 ? "kind" : "kinds"}, on Friction` : "none"}
          tone={r.cur.errors ? "bad" : undefined}
        />
      </div>

      <Panel
        title="Tuning notes"
        sub={notes ? `${notes.findings.length} ${notes.findings.length === 1 ? "rule matched" : "rules matched"} · each names its window` : "could not be read"}
        flush
      >
        {notes && notes.findings.length ? (
          <ul>
            {notes.findings.map((n) => (
              <li key={n.rule} className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-baseline gap-x-3.5 gap-y-1 border-t border-line px-5 py-3 first:border-t-0">
                <span>
                  <Chip tone={n.tone}>{n.kind}</Chip>
                </span>
                <p className="m-0 max-w-[78ch] text-[13.5px] leading-normal text-ink-2">
                  <b className="font-semibold text-ink">{n.lead}</b> {n.rest}
                </p>
                <Link
                  href={hrefFor(n.view)}
                  className="row-span-2 self-center whitespace-nowrap rounded-md px-1.5 py-1 font-ui text-[12px] font-semibold text-accent-ink hover:bg-accent-soft"
                >
                  {n.view === "overview" ? "See below" : n.view.charAt(0).toUpperCase() + n.view.slice(1)} →
                </Link>
                <span className="col-start-2 font-mono text-[11px] text-ink-3">
                  {n.rule} · {n.window}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            {facts.firstAt ? "No rule has anything to say about this window." : "Nothing recorded yet — the first page view starts the clock."}
            {waiting ? <span className="mt-1 block">{waiting}</span> : null}
          </Empty>
        )}
        {notes && notes.findings.length && waiting ? <p className="border-t border-line px-5 py-2.5 font-ui text-[11.5px] text-ink-3">{waiting}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Active time by day" sub="visible, focused, touched in the last minute">
          <ActiveChart
            labels={days.days.map(dayLabel)}
            todayIndex={days.days.length - 1}
            series={[
              { key: "browser", label: "Browser", color: "var(--chart-teal)", values: days.bySurface.browser },
              { key: "mac_app", label: "Mac app", color: "var(--chart-amber)", values: days.bySurface.mac_app },
              { key: "phone", label: "Phone", color: "var(--chart-cash)", values: days.bySurface.phone },
            ]}
          />
        </Panel>
        <Panel title="When you work" sub={f.days === 7 ? "this week by weekday" : `${f.days} days, folded by weekday`}>
          <HeatChart grid={grid} tz={f.tz} />
        </Panel>
      </div>

      <Panel id="how-you-get-there" title="How you get there" sub="share of each page's visits, by how you arrived" flush>
        {topVia.length ? (
          <Scroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Page</th>
                  <th className={cn(TH, "text-right")}>Visits</th>
                  {VIA_COLUMNS.map(([, label]) => (
                    <th key={label} className={cn(TH, "text-center")}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={TBODY}>
                {topVia.map((row) => (
                  <tr key={row.route}>
                    <td className={cn(TD, "whitespace-nowrap font-ui font-semibold text-ink")}>{routeLabel(row.route)}</td>
                    <td className={cn(TD, NUM)}>{formatCount(row.views)}</td>
                    {VIA_COLUMNS.map(([key]) => {
                      const n = row.via[key] ?? 0
                      const share = row.views ? n / row.views : 0
                      return (
                        <td
                          key={key}
                          className={cn(TD, "text-center tabular-nums", n ? "text-ink" : "text-ink-3")}
                          style={n ? { background: `color-mix(in oklab, var(--chart-teal) ${Math.round(share * 55)}%, rgb(var(--card-rgb)))` } : undefined}
                        >
                          {n ? `${Math.round(share * 100)}%` : "—"}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        ) : (
          <Empty>No page views in this window.</Empty>
        )}
      </Panel>
    </>
  )
}
