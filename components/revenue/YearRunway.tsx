import { formatMoney } from "@/lib/work"
import type { RunwayMonth } from "@/lib/revenue"
import { cn } from "@/lib/cn"

export function YearRunway({
  year,
  months,
  landingCents,
  goalCents,
}: {
  year: string
  months: RunwayMonth[]
  landingCents: number
  goalCents: number | null
}) {
  const max = Math.max(...months.map((month) => month.cents), 1)
  const gap = goalCents != null ? goalCents - landingCents : null

  return (
    <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-tk-slate/10 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-tk-onyx">{year} runway</h2>
          <p className="mt-0.5 text-xs text-tk-slate/60">
            Issued months plus booked retainers and dated deliverables
          </p>
        </div>
        <p className="text-xs tabular-nums text-tk-slate/60">
          Landing {formatMoney(landingCents)}
          {goalCents != null ? ` of ${formatMoney(goalCents)}` : ""}
        </p>
      </div>
      <ul className="divide-y divide-tk-slate/10 px-5">
        {months.map((month) => {
          const forecast = month.kind !== "actual"
          const width = Math.max((month.cents / max) * 100, month.cents > 0 ? 2 : 0)
          return (
            <li
              key={month.key}
              className={cn(
                "grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 py-2 text-xs",
                forecast && "opacity-60"
              )}
            >
              <span className={cn("text-tk-slate/70", forecast && "italic")}>
                {month.label}
                {month.kind === "remainder" ? (
                  <span className="ml-1 text-[10px] uppercase tracking-wide">
                    still due
                  </span>
                ) : month.kind === "forecast" ? (
                  <span className="ml-1 text-[10px] uppercase tracking-wide">
                    forecast
                  </span>
                ) : null}
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-tk-linen">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    month.kind === "actual" ? "bg-tk-teal" : "bg-tk-teal/40"
                  )}
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="text-right tabular-nums font-medium text-tk-onyx">
                {month.kind === "remainder" ? "+" : ""}
                {formatMoney(month.cents)}
              </span>
            </li>
          )
        })}
        <li className="flex items-center justify-between py-3 text-xs">
          <span className="font-semibold text-tk-slate">Expected {year} total</span>
          <span className="tabular-nums font-bold text-tk-teal">
            {formatMoney(landingCents)}
          </span>
        </li>
      </ul>
      {gap != null ? (
        <p className="border-t border-tk-slate/10 px-5 py-3 text-xs text-tk-slate/70">
          {gap > 0
            ? `${formatMoney(gap)} still to find above booked work if the year is going to hit ${formatMoney(goalCents!)}.`
            : `Booked work already clears the ${formatMoney(goalCents!)} goal by ${formatMoney(-gap)}.`}
        </p>
      ) : null}
    </section>
  )
}
