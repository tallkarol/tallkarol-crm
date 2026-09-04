import type { ReactNode } from "react"
import { CHART } from "@/lib/insights/chart"
import { cn } from "@/lib/cn"
import { formatWholeMoney, type Horizon, type Verdict } from "@/lib/revenue"
import { Delta } from "./bits"
import { Card } from "@/components/ui/Card"

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  ahead: { label: "Ahead", className: "bg-good-soft text-good" },
  track: { label: "On track", className: "bg-tk-teal/10 text-tk-teal" },
  behind: { label: "Behind", className: "bg-bad-soft text-bad" },
}

/**
 * Billed, then booked, on a scale wide enough to hold whichever of goal and
 * landing is larger — so the goal marker stays honest when booked work
 * overshoots it. The solid tick is what a flat run at goal owes by today.
 */
function Meter({ horizon }: { horizon: Horizon }) {
  const scale = Math.max(
    horizon.goalCents ?? 0,
    horizon.landingCents,
    horizon.billedCents,
    1
  )
  const pct = (cents: number) => Math.min((cents / scale) * 100, 100)
  const billedPct = pct(horizon.billedCents)
  const bookedPct = Math.max(pct(horizon.landingCents) - billedPct, 0)
  const goalPct = horizon.goalCents != null ? pct(horizon.goalCents) : null
  const pacePct = horizon.pace ? pct(horizon.pace.expectedCents) : null

  return (
    <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-well">
      <span
        className="absolute inset-y-0 left-0 bg-[#009688]"
        style={{ width: `${billedPct}%` }}
      />
      {bookedPct > 0 ? (
        <span
          className="absolute inset-y-0 bg-[#009688]/[0.34]"
          style={{ left: `${billedPct}%`, width: `${bookedPct}%` }}
        />
      ) : null}
      {goalPct != null && goalPct < 99.5 ? (
        <span
          className="absolute inset-y-0 w-0.5 bg-well shadow-[0_0_0_1px_rgba(15,22,21,0.35)]"
          style={{ left: `calc(${goalPct}% - 1px)` }}
          aria-hidden
        />
      ) : null}
      {pacePct != null ? (
        <span
          className="absolute inset-y-0 w-0.5 bg-tk-onyx"
          style={{ left: `calc(${pacePct}% - 1px)` }}
          aria-hidden
        />
      ) : null}
    </div>
  )
}

function defaultNote(horizon: Horizon): ReactNode {
  const landingPct =
    horizon.landingShare != null ? Math.round(horizon.landingShare * 100) : null

  if (horizon.id === "month") {
    if (horizon.bookedCents > 0) {
      return (
        <>
          <b className="font-semibold text-tk-onyx">
            {formatWholeMoney(horizon.bookedCents)}
          </b>{" "}
          still to invoice — {horizon.periodLabel} lands{" "}
          <b className="font-semibold text-tk-onyx">
            {formatWholeMoney(horizon.landingCents)}
          </b>
          {landingPct != null ? `, ${landingPct}% of goal` : ""}.
        </>
      )
    }
    return horizon.goalCents != null ? (
      <>
        Everything booked this month is invoiced.{" "}
        <b className="font-semibold text-tk-onyx">
          {Math.round((horizon.goalShare ?? 0) * 100)}%
        </b>{" "}
        of the {formatWholeMoney(horizon.goalCents)} month goal.
      </>
    ) : (
      <>Everything booked this month is invoiced.</>
    )
  }

  if (horizon.id === "quarter") {
    if (horizon.goalCents == null) {
      return <>Booked work lands {horizon.periodLabel} at {formatWholeMoney(horizon.landingCents)}.</>
    }
    const gap = horizon.goalCents - horizon.landingCents
    return gap > 0 ? (
      <>
        Booked work lands {horizon.periodLabel} at{" "}
        <b className="font-semibold text-tk-onyx">
          {formatWholeMoney(horizon.landingCents)}
        </b>{" "}
        —{" "}
        <b className="font-semibold text-tk-onyx">{formatWholeMoney(gap)}</b> short of
        the {formatWholeMoney(horizon.goalCents)} quarter.
      </>
    ) : (
      <>
        Booked work lands {horizon.periodLabel} at{" "}
        <b className="font-semibold text-tk-onyx">
          {formatWholeMoney(horizon.landingCents)}
        </b>{" "}
        — <b className="font-semibold text-tk-onyx">{landingPct}%</b> of goal.
      </>
    )
  }

  return (
    <>
      Booked work lands{" "}
      <b className="font-semibold text-tk-onyx">
        {formatWholeMoney(horizon.landingCents)}
      </b>
      {landingPct != null ? `, ${landingPct}% of the year.` : "."}
    </>
  )
}

export function HorizonPanel({
  horizon,
  note,
}: {
  horizon: Horizon
  /** Overrides the derived sentence — the year panel needs the run-rate math. */
  note?: ReactNode
}) {
  const verdict = VERDICT[horizon.verdict]
  const ahead = horizon.pace?.aheadCents ?? null

  return (
    <Card className="flex flex-col px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-tk-slate">
            {horizon.label}
          </h2>
          <p className="mt-0.5 text-[11px] tabular-nums text-ink-3">
            {horizon.through}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-wide",
            verdict.className
          )}
        >
          {verdict.label}
        </span>
      </div>

      <p className="mt-3 text-[30px] font-semibold leading-none tracking-tight text-tk-onyx tabular-nums">
        {formatWholeMoney(horizon.billedCents)}
      </p>
      {horizon.deltaPct != null && horizon.deltaSuffix ? (
        <Delta pct={horizon.deltaPct} suffix={horizon.deltaSuffix} />
      ) : null}
      <p className="mt-1 text-xs text-ink-3 tabular-nums">
        {horizon.goalCents != null
          ? `${Math.round((horizon.goalShare ?? 0) * 100)}% of the ${formatWholeMoney(horizon.goalCents)} goal`
          : "no goal set"}
      </p>

      <Meter horizon={horizon} />

      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px] tabular-nums text-ink-3">
        {ahead != null ? (
          <span
            className="font-semibold"
            style={{ color: ahead >= 0 ? CHART.good : CHART.bad }}
          >
            {ahead >= 0 ? "▲" : "▼"} {formatWholeMoney(Math.abs(ahead))}{" "}
            <span className="font-medium text-ink-3">
              {ahead >= 0 ? "ahead of pace" : "behind pace"}
            </span>
          </span>
        ) : (
          <span>{formatWholeMoney(horizon.billedCents)} billed</span>
        )}
        {horizon.goalCents != null ? (
          <span>goal {formatWholeMoney(horizon.goalCents)}</span>
        ) : null}
      </div>

      <p className="mt-3 border-t border-line pt-2.5 text-xs leading-relaxed text-tk-slate">
        {note ?? defaultNote(horizon)}
      </p>
    </Card>
  )
}
