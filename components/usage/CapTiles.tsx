import Link from "next/link"
import { Card } from "@/components/ui/Card"
import { Delta } from "@/components/insights/KpiTile"
import { cn } from "@/lib/cn"
import type { BudgetState } from "@/lib/chat/budget"
import { CHART } from "@/lib/insights/chart"
import { ROUTES } from "@/lib/nav"
import { count, deltaPct, dollars, hours, tokens } from "@/lib/usage/format"
import {
  CURSOR_OTHER_POOL_USD,
  ageLabel,
  ageMs,
  isStale,
  type ClaudeMaxReading,
  type CursorReading,
  type RailwayReading,
} from "@/lib/usage/snapshots"
import type { BySurface, CursorIdePools, Pace } from "@/lib/usage/summary"

/**
 * Row one: the caps and the surfaces. The rule every tile obeys: a bar is
 * drawn only when its numerator and denominator come from the same reading
 * — what Claude, cursor.com or Railway itself said. Otherwise the tile
 * prints the number, names what it is, and dates it. Pace is never a
 * percent.
 */

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{children}</p>
}

function Source({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[10.5px] leading-[1.4] text-ink-3">{children}</p>
}

function Meter({ pct, tone = "ok", muted = false }: { pct: number | null; pct2?: number | null; tone?: "ok" | "warn" | "bad"; muted?: boolean }) {
  const fill = muted ? CHART.prev : tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : CHART.teal
  return (
    <div className="relative mt-1.5 h-[5px] rounded-full" style={{ background: CHART.track }}>
      {pct !== null ? (
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: fill }} />
      ) : null}
    </div>
  )
}

function PaceLine({ label, p }: { label: string; p: Pace }) {
  // A window where no row carries tokens prints "—": unknown, never 0.
  return (
    <p className="flex items-baseline justify-between gap-2 font-mono text-[11px] tabular-nums text-ink-2">
      <span className="font-ui text-[10.5px] font-semibold text-ink-3">{label}</span>
      <span>
        {tokens(p.output)} out · {count(p.requests)} req · {hours(p.hours)} · {tokens(p.cacheRead)} cache-read
      </span>
    </p>
  )
}

export function ClaudeTile({
  reading,
  pace,
  now,
  tz,
}: {
  reading: ClaudeMaxReading | null
  pace: { h5: Pace; d7: Pace } | null
  now: Date
  tz: string
}) {
  const stale = reading ? isStale("claude_max", reading.observedAt, now) : true
  const through = pace?.d7.through ?? pace?.h5.through ?? null
  return (
    <Card surface="well" radius="xl" elevation="none" className="px-4 py-3">
      <Label>Claude Max windows</Label>
      {reading && !stale ? (
        <>
          <div className="mt-1 grid grid-cols-2 gap-x-4">
            <div>
              <p className="font-mono text-[15px] font-semibold tabular-nums text-tk-onyx">
                5h {reading.fiveHourPct !== null ? `${Math.round(reading.fiveHourPct)}%` : "—"}
                {reading.resets5h ? <span className="ml-1 text-[10.5px] font-normal text-ink-3">resets {reading.resets5h}</span> : null}
              </p>
              <Meter pct={reading.fiveHourPct} tone={(reading.fiveHourPct ?? 0) >= 90 ? "bad" : (reading.fiveHourPct ?? 0) >= 75 ? "warn" : "ok"} />
            </div>
            <div>
              <p className="font-mono text-[15px] font-semibold tabular-nums text-tk-onyx">
                7d {reading.sevenDayPct !== null ? `${Math.round(reading.sevenDayPct)}%` : "—"}
                {reading.resets7d ? <span className="ml-1 text-[10.5px] font-normal text-ink-3">resets {reading.resets7d}</span> : null}
              </p>
              <Meter pct={reading.sevenDayPct} tone={(reading.sevenDayPct ?? 0) >= 90 ? "bad" : (reading.sevenDayPct ?? 0) >= 75 ? "warn" : "ok"} />
            </div>
          </div>
          <Source>
            Claude&apos;s own reading, {reading.basis === "api" ? "polled" : "typed"} {ageLabel(ageMs(reading.observedAt, now))}.
          </Source>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] font-semibold text-ink-3">no current reading</p>
          <Meter pct={null} muted />
          <Source>
            {reading ? `Last typed ${ageLabel(ageMs(reading.observedAt, now))} — older than the window it describes. ` : ""}
            Run <span className="font-mono">/usage</span> in Claude Code, then the form below.
          </Source>
        </>
      )}
      <div className="mt-3 border-t border-line pt-2">
        <Label>Pace, not the cap</Label>
        {pace ? (
          <div className="mt-1 flex flex-col gap-0.5">
            <PaceLine label="trailing 5 h" p={pace.h5} />
            <PaceLine label="trailing 7 d" p={pace.d7} />
          </div>
        ) : (
          <p className="mt-1 text-[11.5px] text-ink-3">no turns pushed yet</p>
        )}
        <Source>
          Claude Code on this Mac only — claude.ai use, the session-log summarizer&apos;s runs and other machines are not counted. Cache reads
          weigh differently in the window, so this is never a percent.
          {through ? ` Data through ${through.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz })}.` : ""}
          {pace && (pace.d7.noTokenRows > 0) ? ` ${pace.d7.noTokenRows} turns in 7 d carry no tokens.` : ""}
        </Source>
      </div>
    </Card>
  )
}

export function CursorTile({
  reading,
  budget,
  ide,
  now,
}: {
  reading: CursorReading | null
  budget: BudgetState | null
  ide: CursorIdePools | null
  now: Date
}) {
  const stale = reading ? isStale("cursor_dashboard", reading.observedAt, now) : true
  const usd = reading?.otherModelsUsd ?? null
  const pool = reading?.otherModelsPoolUsd ?? null
  // The bar needs both ends from the same dashboard visit: the percent the
  // dashboard showed, or dollars over the pool size typed with them. Dollars
  // over the plan's constant is a number, not a bar.
  const pct = reading?.otherModelsPct !== null && reading?.otherModelsPct !== undefined ? reading.otherModelsPct : usd !== null && pool ? (usd / pool) * 100 : null
  return (
    <Card surface="well" radius="xl" elevation="none" className="px-4 py-3">
      <Label>Cursor · Other models pool</Label>
      {reading && !stale ? (
        <>
          <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-tk-onyx">
            {usd !== null ? `${dollars(usd, 0)}${pool ? ` of ${dollars(pool, 0)}` : ""}` : pct !== null ? `${Math.round(pct)}%` : "—"}
            {pct !== null && usd !== null ? <span className="ml-1 text-[11px] font-normal text-ink-3">{Math.round(pct)}%</span> : null}
            {reading.planPct !== null ? <span className="ml-1.5 text-[10.5px] font-normal text-ink-3">plan {Math.round(reading.planPct)}%</span> : null}
            {reading.cursorModelsPct !== null ? <span className="ml-1.5 text-[10.5px] font-normal text-ink-3">Cursor models {Math.round(reading.cursorModelsPct)}%</span> : null}
          </p>
          <Meter pct={pct} tone={(pct ?? 0) >= 90 ? "bad" : (pct ?? 0) >= 75 ? "warn" : "ok"} muted={pct === null} />
          <Source>
            cursor.com says so, typed {ageLabel(ageMs(reading.observedAt, now))}
            {reading.cycleEnd ? ` · cycle ends ${reading.cycleEnd}` : ""}
            {reading.onDemandUsd ? ` · on-demand ${dollars(reading.onDemandUsd, 0)}` : ""}
            {pct === null && usd !== null ? ` · no bar: type the pool size (plan says ${dollars(CURSOR_OTHER_POOL_USD, 0)}) or the percent with the reading` : ""}.
          </Source>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] font-semibold text-ink-3">no reading</p>
          <Meter pct={null} muted />
          <Source>
            {reading ? `Last typed ${ageLabel(ageMs(reading.observedAt, now))}. ` : ""}
            cursor.com › Usage, then the form below. The only figure for the $400 pool that covers IDE spend.
          </Source>
        </>
      )}
      <div className="mt-3 border-t border-line pt-2">
        {budget ? (
          <p className="text-[11.5px] leading-[1.45] text-ink-2">
            CRM chat share: <b className="font-mono tabular-nums text-tk-onyx">{dollars(budget.other.spentCents / 100)}</b> at registry rates ·
            calendar month, not your cycle · chat gate at {dollars((budget.other.limitCents - budget.other.reserveCents) / 100, 0)} /{" "}
            {dollars(budget.other.limitCents / 100, 0)} ·{" "}
            <Link href={ROUTES.chat} className="font-semibold text-accent-ink">
              the rail
            </Link>
          </p>
        ) : (
          <p className="text-[11.5px] text-ink-3">chat share unavailable</p>
        )}
        {ide ? (
          <p className="mt-1 text-[11.5px] leading-[1.45] text-ink-2">
            IDE this window: {count(ide.cursor)} turns on Cursor models, {count(ide.other)} on Other models
            {ide.models.length ? ` (${ide.models.join(", ")})` : ""}
            {ide.unregistered ? `, ${count(ide.unregistered)} on models the registry does not know (${ide.unregisteredIds.join(", ")})` : ""}
            {ide.unknown ? `, ${count(ide.unknown)} that wrote no code (no model recorded)` : ""} — no dollar source.
          </p>
        ) : null}
      </div>
    </Card>
  )
}

export function RailwayTile({ reading, now }: { reading: RailwayReading | null; now: Date }) {
  if (!reading) {
    return (
      <Card surface="well" radius="xl" elevation="none" className="px-4 py-3">
        <Label>Railway</Label>
        <p className="mt-1 text-[13px] font-semibold text-ink-3">no snapshot yet</p>
        <Meter pct={null} muted />
        <Source>railway-usage.sh on the Mac posts `railway usage --json` twice a day.</Source>
      </Card>
    )
  }
  const stale = isStale("railway", reading.observedAt, now)
  const pct = reading.hardLimit ? (reading.usedDollars / reading.hardLimit) * 100 : null
  return (
    <Card surface="well" radius="xl" elevation="none" className={cn("px-4 py-3", reading.overLimit && "border-bad/40")}>
      <Label>Railway · this billing period</Label>
      <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-tk-onyx">
        {dollars(reading.usedDollars)}
        {reading.hardLimit !== null ? <span className="text-ink-3"> of {dollars(reading.hardLimit, 0)} hard limit</span> : null}
        {reading.overLimit ? <span className="ml-1.5 rounded-full bg-bad-soft px-1.5 py-0.5 font-ui text-[9.5px] font-bold uppercase tracking-wide text-bad">over</span> : null}
      </p>
      <Meter pct={pct} tone={reading.overLimit ? "bad" : (pct ?? 0) >= 75 ? "warn" : "ok"} muted={stale} />
      <p className="mt-1.5 text-[11px] text-ink-2">
        est. {dollars(reading.estimatedDollars)} by {reading.periodEnd ?? "period end"}
        {reading.lineItems.length ? ` · ${reading.lineItems.slice().sort((a, b) => b.dollars - a.dollars).slice(0, 2).map((i) => `${i.label.toLowerCase()} ${dollars(i.dollars, 0)}`).join(", ")}` : ""}
      </p>
      <ul className="mt-2 flex flex-col gap-0.5">
        {reading.projects.slice(0, 4).map((p) => (
          <li key={p.name} className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-ink-2">
              {p.name}
              {p.clientSlug ? <span className="text-ink-3"> · {p.clientSlug}</span> : <span className="text-ink-3"> · unnamed</span>}
            </span>
            <span className="font-mono tabular-nums text-tk-onyx">
              {dollars(p.dollars)} <span className="text-ink-3">{Math.round(p.share * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
      <Source>
        `railway usage --json`, read {ageLabel(ageMs(reading.observedAt, now))}
        {stale ? " — expected twice daily, this one is late" : ""}.
      </Source>
    </Card>
  )
}

export function SurfaceTile({ surfaces, days }: { surfaces: BySurface | null; days: number }) {
  if (!surfaces) {
    return (
      <Card surface="well" radius="xl" elevation="none" className="px-4 py-3">
        <Label>This window by surface</Label>
        <p className="mt-1 text-[13px] font-semibold text-ink-3">could not be read</p>
      </Card>
    )
  }
  const c = surfaces.claude
  const u = surfaces.cursor
  const h = surfaces.chat
  // Every Claude turn unknown → "—", not a real-looking zero.
  const claudeOut = c.cur.turns > 0 && c.cur.noTokenRows >= c.cur.turns + c.cur.subagentRuns ? "— out" : `${tokens(c.cur.outputTokens)} out`
  const unknownNote = c.cur.noTokenRows > 0 ? ` · ${count(c.cur.noTokenRows)} without tokens` : ""
  const line = (label: string, value: string, delta: number | null, note?: string) => (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-ui text-[11px] font-semibold text-tk-onyx">{label}</span>
      <span className="text-right">
        <span className="font-mono text-[12px] tabular-nums text-tk-onyx">{value}</span>
        {note ? <span className="ml-1 text-[10.5px] text-ink-3">{note}</span> : null}
        <span className="ml-1.5 inline-block align-baseline [&>p]:mt-0 [&>p]:inline">
          <Delta pct={delta} suffix="" />
        </span>
      </span>
    </div>
  )
  return (
    <Card surface="well" radius="xl" elevation="none" className="px-4 py-3">
      <Label>Last {days} days by surface</Label>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {line(
          "Claude Code",
          `${hours(c.cur.hours)} · ${count(c.cur.turns)} turns`,
          deltaPct(c.cur.turns, c.prev.turns),
          `${claudeOut} · ${count(c.cur.subagentRuns)} subagent runs · ${count(c.cur.sessions)} sessions${unknownNote}`
        )}
        {line("Cursor IDE", `${hours(u.cur.hours)} · ${count(u.cur.turns)} turns`, deltaPct(u.cur.turns, u.prev.turns), `${count(u.cur.sessions)} conversations · tokens: no source`)}
        {line("CRM chat", `${count(h.cur.turns)} turns · ${dollars(h.cur.cents / 100)}`, deltaPct(h.cur.turns, h.prev.turns), "registry rates")}
      </div>
      <Source>
        Deltas are turns against the previous {days} days. Hours are unweighted parent-turn time (a subagent runs inside its turn);
        parallel sessions overlap; billed hours are weighted on the timesheet. No total across surfaces — three units.
      </Source>
    </Card>
  )
}
