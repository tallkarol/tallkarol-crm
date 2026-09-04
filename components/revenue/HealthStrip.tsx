import type { ReactNode } from "react"
import { fmtHours } from "@/lib/engagements"
import type { RevenueKpis } from "@/lib/revenue"
import { formatMoney } from "@/lib/work"
import { CHART } from "@/lib/insights/chart"

function Cell({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string
  value: string
  unit?: string
  sub: ReactNode
  tone?: string
}) {
  return (
    <div className="border-l border-t border-line px-4 py-3.5 first:border-l-0 sm:border-t-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-3">
        {label}
      </p>
      <p
        className="mt-1 text-base font-semibold tracking-tight text-tk-onyx tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value}
        {unit ? (
          <span className="text-xs font-medium text-ink-3">{unit}</span>
        ) : null}
      </p>
      <p className="mt-0.5 text-[11px] tabular-nums text-ink-3">{sub}</p>
    </div>
  )
}

/**
 * Everything that qualifies the pace board without being performance:
 * how much of the billing is real money, and what the base rate looks like.
 */
export function HealthStrip({
  kpis,
  periodLabel,
}: {
  kpis: RevenueKpis
  periodLabel: string
}) {
  const collectedShare =
    kpis.billedCents > 0
      ? Math.round((kpis.collectedCents / kpis.billedCents) * 100)
      : null
  const recurringShare =
    kpis.monthlyGoalCents && kpis.monthlyGoalCents > 0
      ? Math.round((kpis.recurringCents / kpis.monthlyGoalCents) * 100)
      : null

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Is the money real?</h2>
        <p className="text-xs text-ink-3">
          {periodLabel} · what qualifies the numbers above
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <Cell
          label="Collected"
          value={formatMoney(kpis.collectedCents)}
          sub={
            kpis.outstandingCents > 0
              ? `${formatMoney(kpis.outstandingCents)} outstanding`
              : collectedShare != null
                ? `${collectedShare}% of billed · nothing outstanding`
                : "nothing unpaid"
          }
        />
        <Cell
          label="Still draft"
          value={formatMoney(kpis.draftCents)}
          tone={kpis.draftCents > 0 ? CHART.amber : undefined}
          sub={kpis.draftCents > 0 ? "issued, not yet sent" : "everything sent"}
        />
        <Cell
          label="Blended rate"
          value={kpis.hourlyCents != null ? formatMoney(kpis.hourlyCents) : "—"}
          unit={kpis.hourlyCents != null ? "/hr" : undefined}
          sub={
            kpis.hourlyHours > 0
              ? `${fmtHours(kpis.hourlyHours)} hr on invoices that carry hours`
              : "no hourly invoices in this window"
          }
        />
        <Cell
          label="Recurring base"
          value={formatMoney(kpis.recurringCents)}
          unit="/mo"
          sub={`${fmtHours(kpis.recurringHours)} hr capacity${
            recurringShare != null ? ` · ${recurringShare}% of month goal` : ""
          }`}
        />
      </div>
    </section>
  )
}
