import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { ROUTES } from "@/lib/nav"
import { formatMoney } from "@/lib/work"

export type YearMonth = {
  key: string
  label: string
  cents: number
}

export type ForecastMonthRow = YearMonth & {
  /** true for the current month's "still expected" remainder row */
  remainder?: boolean
}

export function YearBilled({
  year,
  ytdCents,
  annualGoalCents,
  months,
  forecastMonths = [],
  expectedTotalCents = null,
}: {
  year: string
  ytdCents: number
  annualGoalCents: number | null
  months: YearMonth[]
  /** Greyed-out projection rows for the rest of the year. */
  forecastMonths?: ForecastMonthRow[]
  /** YTD actual + projected remainder — the year-end landing estimate. */
  expectedTotalCents?: number | null
}) {
  return (
    <details className="group min-w-0 rounded-2xl border border-tk-slate/15 bg-white shadow-sm open:[&_svg]:rotate-0">
      <summary className="flex min-w-0 cursor-pointer list-none flex-col px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-tk-slate/70">
            Billed in {year}
          </p>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 -rotate-90 text-tk-slate/50 transition-transform duration-200 motion-reduce:transition-none"
          />
        </div>
        <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
          <p className="shrink-0 text-2xl font-semibold tracking-tight text-tk-onyx tabular-nums">
            {formatMoney(ytdCents)}
          </p>
          <p className="min-w-0 truncate text-right text-xs text-tk-slate/60">
            {annualGoalCents ? (
              <>
                <span className="font-semibold text-tk-teal">
                  {Math.round((ytdCents / annualGoalCents) * 100)}%
                </span>{" "}
                of {formatMoney(annualGoalCents)} year goal
              </>
            ) : months.every((m) => m.cents === 0) ? (
              "No invoices yet this year"
            ) : (
              "year to date"
            )}
          </p>
        </div>
        {annualGoalCents ? (
          <YearBar fraction={ytdCents / annualGoalCents} />
        ) : null}
      </summary>
      <div className="border-t border-tk-slate/10 px-5 py-3">
        {months.length === 0 ? (
          <p className="text-sm text-tk-slate/70">No invoices yet this year.</p>
        ) : (
          <ul className="space-y-1.5">
            {months.map((m) => (
              <li
                key={m.key}
                className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs"
              >
                <span className="text-tk-slate/70">{m.label}</span>
                <span className="tabular-nums font-medium text-tk-onyx">
                  {formatMoney(m.cents)}
                </span>
              </li>
            ))}
            {forecastMonths.map((m) => (
              <li
                key={m.key}
                className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs opacity-50"
              >
                <span className="italic text-tk-slate/70">
                  {m.label}
                  <span className="ml-1 text-[10px] uppercase tracking-wide">
                    {m.remainder ? "still expected" : "forecast"}
                  </span>
                </span>
                <span className="tabular-nums font-medium text-tk-slate">
                  {m.remainder ? "+" : ""}
                  {formatMoney(m.cents)}
                </span>
              </li>
            ))}
            {expectedTotalCents != null ? (
              <li className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-3 border-t border-tk-slate/10 pt-2 text-xs">
                <span className="font-semibold text-tk-slate">Expected {year} total</span>
                <span className="tabular-nums font-bold text-tk-teal">
                  {formatMoney(expectedTotalCents)}
                </span>
              </li>
            ) : null}
          </ul>
        )}
        <Link
          href={ROUTES.revenue}
          className="mt-3 inline-block text-xs font-semibold text-tk-teal hover:underline"
        >
          Revenue →
        </Link>
      </div>
    </details>
  )
}

/* Horizontal year-goal track. Width is capped at 100%; the copy above
   can still read over 100% if YTD has already passed the goal. */
function YearBar({ fraction }: { fraction: number }) {
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <span className="mt-2.5 block h-2 overflow-hidden rounded-full bg-tk-linen">
      <span
        className="block h-full rounded-full bg-tk-teal"
        style={{ width: `${(f * 100).toFixed(1)}%` }}
      />
    </span>
  )
}
