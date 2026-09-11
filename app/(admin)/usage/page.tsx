import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { Card } from "@/components/ui/Card"
import { BreakdownTable, type Row } from "@/components/usage/BreakdownTable"
import { ClaudeTile, CursorTile, RailwayTile, SurfaceTile } from "@/components/usage/CapTiles"
import { HourBars } from "@/components/usage/HourBars"
import { ReadingForm } from "@/components/usage/ReadingForm"
import { SourcesFooter } from "@/components/usage/SourcesFooter"
import { WhereChart } from "@/components/usage/WhereChart"
import { getSessionUser } from "@/lib/auth"
import { budgetState } from "@/lib/chat/budget"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { workspaceTimezone } from "@/lib/timezone"
import { count, dollars, hours, share, tokens } from "@/lib/usage/format"
import { latestBySource, parseClaudeMax, parseCursor, parseRailway, recentReadings, ageLabel, ageMs } from "@/lib/usage/snapshots"
import {
  byClientSurface,
  byDayClient,
  byHour,
  byLane,
  byModel,
  bySurface,
  cursorIdeByPool,
  pace,
  sourceHealth,
  windowDays,
  windowFor,
} from "@/lib/usage/summary"

export const metadata = { title: "Usage" }
export const dynamic = "force-dynamic"

/**
 * Where this window's agent work went and whether a cap is close. Every
 * number names its source and its age. Three units — hours, tokens,
 * dollars — never sum into one figure. A dead source is an empty tile,
 * never a broken page: each loader is caught on its own.
 */
export default async function UsagePage({ searchParams }: { searchParams: { days?: string } }) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const now = new Date()
  const days = windowDays(searchParams.days)
  const tz = await workspaceTimezone().catch(() => "Europe/Warsaw")
  const w = windowFor(days, now, tz)

  const none: Awaited<ReturnType<typeof latestBySource>> = {}
  const [snapshots, surfaces, where, clientRows, laneRows, modelRows, hourSlots, paceNow, ide, budget, health] = await Promise.all([
    latestBySource().catch(() => none),
    bySurface(w).catch(() => null),
    byDayClient(w).catch(() => null),
    byClientSurface(w).catch(() => null),
    byLane(w).catch(() => null),
    byModel(w).catch(() => null),
    byHour(w).catch(() => null),
    pace(now).catch(() => null),
    cursorIdeByPool(w).catch(() => null),
    budgetState(now).catch(() => null),
    sourceHealth(w).catch(() => null),
  ])
  const [claudeReadings, cursorReadings] = await Promise.all([
    recentReadings("claude_max", 5).catch(() => []),
    recentReadings("cursor_dashboard", 5).catch(() => []),
  ])

  const railway = snapshots.railway ? parseRailway(snapshots.railway) : null
  const claude = snapshots.claude_max ? parseClaudeMax(snapshots.claude_max) : null
  const cursor = snapshots.cursor_dashboard ? parseCursor(snapshots.cursor_dashboard) : null

  const clientTable: Row[] = (clientRows ?? []).map((r) => ({
    key: `${r.client}|${r.surface}`,
    cells: {
      client: r.client,
      surface: r.surface === "claude" ? "Claude Code" : r.surface === "cursor" ? "Cursor IDE" : "CRM chat",
      hours: r.hours === null ? "—" : hours(r.hours),
      turns: `${count(r.turns)}${r.prevTurns ? ` (${r.prevTurns})` : ""}`,
      output: r.surface === "cursor" ? "no source" : r.outputTokens === null ? "—" : tokens(r.outputTokens),
      cache: r.cacheShare === null ? "—" : `${Math.round(r.cacheShare * 100)}%`,
      dollars: r.dollars === null ? (r.surface === "claude" ? "Max plan" : "—") : dollars(r.dollars),
    },
    shareValue: r.surface === "chat" ? null : r.hours,
  }))

  const laneTable: Row[] = (laneRows ?? []).map((r) => ({
    key: r.lane,
    cells: {
      lane: r.lane,
      turns: count(r.turns),
      output: r.outputTokens === null ? "—" : tokens(r.outputTokens),
      dollars: r.dollars === null ? "—" : dollars(r.dollars),
    },
    shareValue: r.turns,
  }))

  const modelTable: Row[] = (modelRows ?? []).map((r) => ({
    key: `${r.model}|${r.surface}`,
    cells: {
      model: r.model,
      surface: r.surface === "claude" ? "Claude Code" : r.surface === "cursor" ? "Cursor IDE" : "CRM chat",
      requests: r.surface === "chat" ? count(r.turns) : r.requests === null ? "—" : count(r.requests),
      input: r.surface === "cursor" ? "no source" : tokens(r.inputTokens),
      cacheRead: r.surface === "cursor" ? "" : tokens(r.cacheReadTokens),
      cacheWrite: r.surface === "cursor" ? "" : tokens(r.cacheWriteTokens),
      output: r.surface === "cursor" ? "" : tokens(r.outputTokens),
      thinking: r.surface === "cursor" ? "" : r.thinkingTokens === null ? "—" : tokens(r.thinkingTokens),
      dollars: r.surface === "chat" ? dollars(r.dollars) : r.surface === "claude" ? "Max plan, no $" : "no source",
    },
    shareValue: r.outputTokens,
  }))

  const totalClaudeOut = (clientRows ?? []).filter((r) => r.surface === "claude").reduce((s, r) => s + (r.outputTokens ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Usage"
        actions={
          <nav className="flex gap-0.5 rounded-[10px] border border-line bg-well p-[3px]" aria-label="Window">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={d === 7 ? ROUTES.usage : `${ROUTES.usage}?days=${d}`}
                aria-current={days === d ? "page" : undefined}
                className={cn(
                  "rounded-[8px] px-2.5 py-1 font-ui text-[11px] font-semibold",
                  days === d ? "bg-card text-tk-onyx shadow-card" : "text-ink-3 hover:text-tk-onyx"
                )}
              >
                {d} days
              </Link>
            ))}
          </nav>
        }
      />
      <p className="mt-1 max-w-2xl text-sm text-ink-3">
        Where the agent work went and whether a cap is close. Every number names its source and its age; a bar is drawn only when
        the provider itself gave both ends of it. Times in {tz.replace("_", " ")}.
      </p>

      <div className="mt-6 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        <ClaudeTile reading={claude} pace={paceNow} now={now} tz={tz} />
        <CursorTile reading={cursor} budget={budget} ide={ide} now={now} />
        <RailwayTile reading={railway} now={now} />
        <SurfaceTile surfaces={surfaces} days={days} />
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold text-tk-onyx">Where it went</h2>
          <p className="text-[11px] text-ink-3">per day, one segment per client · scaled to the window&apos;s busiest day</p>
        </div>
        <div className="mt-3">
          {where ? <WhereChart series={where} /> : <p className="py-10 text-center text-[12.5px] text-ink-3">could not be read</p>}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="font-display text-[15px] font-semibold text-tk-onyx">When</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-3">turns by hour of day across the window — Claude Code, Cursor and CRM chat together</p>
            <div className="mt-3">{hourSlots ? <HourBars slots={hourSlots} tz={tz} /> : <p className="text-[12.5px] text-ink-3">could not be read</p>}</div>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-[15px] font-semibold text-tk-onyx">Readings</h2>
            <p className="mt-0.5 text-[11.5px] leading-[1.45] text-ink-3">
              The two caps the CRM cannot read for itself. Type what the dashboard shows; the tile above uses the newest one and greys it
              when it is older than the window it describes.
            </p>
            <div className="mt-3">
              <ReadingForm />
            </div>
            {claudeReadings.length || cursorReadings.length ? (
              <ul className="mt-4 flex flex-col gap-1 border-t border-line pt-3">
                {[...claudeReadings, ...cursorReadings]
                  .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
                  .slice(0, 6)
                  .map((r) => {
                    const p = r.payload as Record<string, unknown>
                    const pacePair = (p.pace as { h5?: { output?: number } } | undefined)?.h5
                    const pctOrDash = (v: unknown) => (typeof v === "number" ? `${v}%` : "—")
                    return (
                      <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[11.5px]">
                        <span className="text-ink-2">
                          <b className="font-semibold text-tk-onyx">{r.source === "claude_max" ? "Claude Max" : "Cursor"}</b>{" "}
                          {r.source === "claude_max"
                            ? `5h ${pctOrDash(p.five_hour_pct)} · 7d ${pctOrDash(p.seven_day_pct)}`
                            : `${p.other_models_usd != null ? dollars(Number(p.other_models_usd), 0) : "—"} other models · plan ${pctOrDash(p.plan_pct)}`}
                          {pacePair && typeof pacePair.output === "number" ? (
                            <span className="text-ink-3"> · pace then {tokens(pacePair.output)} out / 5 h</span>
                          ) : null}
                        </span>
                        <span className="font-mono text-[10.5px] tabular-nums text-ink-3">{ageLabel(ageMs(r.observedAt, now))}</span>
                      </li>
                    )
                  })}
              </ul>
            ) : null}
          </Card>
        </div>

        <Card className="flex flex-col gap-6 p-5">
          <BreakdownTable
            title="Client × surface"
            note={`Hours are unweighted turn time on the Mac; output tokens are Claude Code only (${tokens(totalClaudeOut)} in the window); $ is CRM chat at registry rates. Turns show the previous window in parentheses. The share bar is hours.`}
            columns={[
              { key: "client", label: "Client" },
              { key: "surface", label: "Surface" },
              { key: "hours", label: "Hours", align: "right" },
              { key: "turns", label: "Turns", align: "right" },
              { key: "output", label: "Out tokens", align: "right" },
              { key: "cache", label: "Cache-read", align: "right" },
              { key: "dollars", label: "$", align: "right" },
            ]}
            rows={clientTable}
          />
          <BreakdownTable
            title="Lane"
            note="skill:<name> is the skill a turn invoked (a turn that invoked several is counted under the first); agent:<type> is a subagent run and exact; persona:<desk> and job:<type> are CRM chat. 'no lane' is a plain turn."
            columns={[
              { key: "lane", label: "Lane" },
              { key: "turns", label: "Turns", align: "right" },
              { key: "output", label: "Out tokens", align: "right" },
              { key: "dollars", label: "$ chat", align: "right" },
            ]}
            rows={laneTable}
          />
          <BreakdownTable
            title="Model"
            note="Requests are API calls (one per requestId) for Claude Code and turns for CRM chat. Claude Code runs on the Max plan and has no dollar figure; a Cursor IDE turn has no token source."
            columns={[
              { key: "model", label: "Model" },
              { key: "surface", label: "Surface" },
              { key: "requests", label: "Req", align: "right" },
              { key: "input", label: "Input", align: "right" },
              { key: "cacheRead", label: "Cache read", align: "right" },
              { key: "cacheWrite", label: "Cache write", align: "right" },
              { key: "output", label: "Output", align: "right" },
              { key: "thinking", label: "Thinking", align: "right" },
              { key: "dollars", label: "$", align: "right" },
            ]}
            rows={modelTable}
          />
          {clientRows && clientRows.length ? (
            <p className="text-[10.5px] text-ink-3">
              Share of the window&apos;s Claude Code output by client:{" "}
              {clientRows
                .filter((r) => r.surface === "claude" && r.outputTokens)
                .sort((a, b) => (b.outputTokens ?? 0) - (a.outputTokens ?? 0))
                .slice(0, 5)
                .map((r) => `${r.client} ${share(r.outputTokens ?? 0, totalClaudeOut)}`)
                .join(" · ")}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="mt-6">
        <SourcesFooter health={health} snapshots={snapshots} now={now} />
      </div>
    </>
  )
}
