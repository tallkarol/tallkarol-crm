import { CHART } from "@/lib/insights/chart"
import { cn } from "@/lib/cn"
import { formatWholeMoney, type QuarterRow } from "@/lib/revenue"

/** Two thirds of goal is the line between a soft quarter and a bad one. */
function toneFor(row: QuarterRow) {
  if (row.share == null) return CHART.prev
  if (row.share >= 1) return CHART.good
  if (row.share >= 2 / 3) return CHART.amber
  return CHART.bad
}

export function QuarterGrid({ quarters }: { quarters: QuarterRow[] }) {
  const cleared = quarters.filter(
    (row) => row.state !== "future" && row.share != null && row.share >= 1
  )
  const goal = quarters[0]?.goalCents ?? null

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">By quarter</h2>
        <p className="text-xs tabular-nums text-ink-3">
          {goal != null ? `${formatWholeMoney(goal)} goal each · ` : ""}dimmed is
          booked, not billed
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4">
        {quarters.map((row) => {
          const tone = toneFor(row)
          const scale = Math.max(row.goalCents ?? 0, row.landingCents, 1)
          const billedPct = Math.min((row.billedCents / scale) * 100, 100)
          const bookedPct = Math.max(
            Math.min((row.landingCents / scale) * 100, 100) - billedPct,
            0
          )
          return (
            <div
              key={row.id}
              className={cn(
                "border-l border-t border-line px-4 py-3.5 first:border-l-0 sm:border-t-0",
                row.state === "current" && "bg-tk-teal/[0.035]"
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-tk-slate">
                  {row.id}
                  {row.state === "current" ? (
                    <span className="ml-1 font-semibold text-tk-teal">· now</span>
                  ) : null}
                </p>
                {row.share != null ? (
                  <p
                    className="text-xs font-bold tabular-nums"
                    style={{ color: tone }}
                  >
                    {Math.round(row.share * 100)}%
                  </p>
                ) : null}
              </div>

              <p className="mt-1.5 text-lg font-semibold tracking-tight text-tk-onyx tabular-nums">
                {formatWholeMoney(row.landingCents)}
              </p>

              <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-well">
                <span
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${billedPct}%`, background: tone }}
                />
                {bookedPct > 0 ? (
                  <span
                    className="absolute inset-y-0 opacity-[0.34]"
                    style={{
                      left: `${billedPct}%`,
                      width: `${bookedPct}%`,
                      background: tone,
                    }}
                  />
                ) : null}
              </div>

              <p className="mt-1.5 text-[11px] tabular-nums text-ink-3">
                {row.state === "future"
                  ? `${row.monthsLabel} · all booked`
                  : row.bookedCents > 0
                    ? `${formatWholeMoney(row.billedCents)} billed · ${formatWholeMoney(row.bookedCents)} booked`
                    : row.goalCents != null
                      ? row.landingCents >= row.goalCents
                        ? `${formatWholeMoney(row.landingCents - row.goalCents)} over goal`
                        : `${formatWholeMoney(row.goalCents - row.landingCents)} under goal`
                      : row.monthsLabel}
              </p>
            </div>
          )
        })}
      </div>

      {cleared.length > 0 ? (
        <p className="border-t border-line px-5 py-2.5 text-xs text-ink-3">
          {cleared.length === 1
            ? `${cleared[0].id} is the only quarter this year to clear goal.`
            : `${cleared.map((row) => row.id).join(", ")} clear goal.`}
        </p>
      ) : null}
    </section>
  )
}
