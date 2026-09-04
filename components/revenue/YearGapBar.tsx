import Link from "next/link"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import {
  formatAxisMoney,
  formatWholeMoney,
  type QuarterRow,
  type YearPlan,
} from "@/lib/revenue"

const HATCH =
  "repeating-linear-gradient(135deg, rgba(176,120,24,0.30) 0 5px, rgba(176,120,24,0.12) 5px 10px)"

/**
 * Billed, booked and unsold on one goal-width scale, so the year reads as a
 * gap you can act on rather than a landing figure to subtract from.
 */
export function YearGapBar({
  plan,
  quarters,
}: {
  plan: YearPlan
  quarters: QuarterRow[]
}) {
  if (plan.goalCents == null || plan.goalCents <= 0) {
    return (
      <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-tk-onyx">Making the year</h2>
        </div>
        <p className="px-5 py-6 text-sm text-ink-3">
          Booked work lands {formatWholeMoney(plan.landingCents)} for {plan.yearKey}.{" "}
          <Link
            href={ROUTES.settings}
            className="font-semibold text-tk-teal hover:underline"
          >
            Set a year goal
          </Link>{" "}
          to see the gap.
        </p>
      </section>
    )
  }

  const goal = plan.goalCents
  const gap = plan.gapCents ?? 0
  const pct = (cents: number) =>
    Math.max(Math.min((cents / goal) * 100, 100), 0)
  const ytdPct = pct(plan.ytdCents)
  const bookedPct = Math.max(pct(plan.landingCents) - ytdPct, 0)
  const gapPct = Math.max(100 - ytdPct - bookedPct, 0)

  const halfGoal = plan.halfGoalCents ?? 0
  const h1Gap = halfGoal - plan.h1BilledCents
  const h2Gap = plan.h2LandingCents - halfGoal

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Making the year</h2>
        <p className="text-xs tabular-nums text-ink-3">
          {formatWholeMoney(plan.landingCents)} landing
          {gap > 0 ? ` · ${formatWholeMoney(gap)} to find` : " · goal already booked"}
        </p>
      </div>

      <div className="px-5 pb-4 pt-4">
        <div className="flex h-[30px] overflow-hidden rounded-lg bg-well">
          <div className="bg-[#009688]" style={{ width: `${ytdPct}%` }} />
          <div
            className="bg-[#009688]/[0.38]"
            style={{ width: `${bookedPct}%` }}
          />
          {gapPct > 0 ? (
            <div
              className="shadow-[inset_1px_0_0_rgba(176,120,24,0.55)]"
              style={{ width: `${gapPct}%`, background: HATCH }}
            />
          ) : null}
        </div>

        <div className="relative mt-1.5 h-5">
          {[25, 50, 75, 100].map((mark) => (
            <span
              key={mark}
              className={cn(
                "absolute top-0 whitespace-nowrap text-[10px] tabular-nums text-ink-3 before:absolute before:-top-[7px] before:h-[5px] before:w-px before:bg-line-strong before:content-['']",
                mark === 100
                  ? "-translate-x-full before:right-0"
                  : "-translate-x-1/2 before:left-1/2"
              )}
              style={{ left: `${mark}%` }}
            >
              {formatAxisMoney(Math.round((goal * mark) / 100))}
              {mark === 100 ? " goal" : ""}
            </span>
          ))}
        </div>

        <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-tk-slate">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[3px] bg-[#009688]" />
            Billed to date · {formatWholeMoney(plan.ytdCents)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[3px] bg-[#009688]/[0.38]" />
            Booked retainers &amp; dated deliverables · {formatWholeMoney(plan.bookedCents)}
          </span>
          {gap > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-[3px]"
                style={{ background: HATCH }}
              />
              Unsold · {formatWholeMoney(gap)}
              {plan.monthsLeftLabel
                ? ` over ${plan.monthsLeft} months`
                : " before year end"}
            </span>
          ) : null}
        </div>
      </div>

      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-tk-slate">
        {h1Gap > 0 && quarters[2].landingCents > 0 ? (
          <>
            H1 came in{" "}
            <b className="font-semibold text-tk-onyx">{formatWholeMoney(h1Gap)}</b>{" "}
            under goal; booked work has H2 landing{" "}
            <b className="font-semibold text-tk-onyx">
              {formatWholeMoney(Math.abs(h2Gap))}
            </b>{" "}
            {h2Gap >= 0 ? "over" : "under"}. The hole is behind you, not ahead.
          </>
        ) : (
          <>
            H1 {formatWholeMoney(plan.h1BilledCents)} · H2 landing{" "}
            {formatWholeMoney(plan.h2LandingCents)} against {formatWholeMoney(halfGoal)} a
            half.
          </>
        )}
      </p>
    </section>
  )
}
