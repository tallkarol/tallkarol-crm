"use client"

import { useState } from "react"
import { RevenueChart } from "@/components/dashboard/RevenueChart"
import { chartColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import {
  formatWholeMoney,
  type MonthlyCashPoint,
  type MonthlyStackPoint,
} from "@/lib/revenue"
import { formatMoney } from "@/lib/work"
import { BilledChart } from "./BilledChart"
import { CashChart } from "./CashChart"
import { RateChart } from "./RateChart"

const VIEWS = [
  { id: "billed", label: "Billed" },
  { id: "clients", label: "By client" },
  { id: "cash", label: "Collected" },
  { id: "rate", label: "Rate" },
] as const

type View = (typeof VIEWS)[number]["id"]

function Key({ color, opacity, label }: { color: string; opacity?: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-2.5 rounded-[3px]"
        style={{ background: color, opacity }}
      />
      {label}
    </span>
  )
}

export function MonthlyBoard({
  stack,
  cash,
  series,
  goalCents,
  note,
}: {
  stack: MonthlyStackPoint[]
  cash: MonthlyCashPoint[]
  series: { slug: string; name: string }[]
  goalCents: number | null
  note: string
}) {
  const [view, setView] = useState<View>("billed")
  const points = stack.map((point) => ({ month: point.label, values: point.values }))
  const latestAvg = cash[cash.length - 1]?.avg3 ?? 0
  const hasRemainder = cash.some((point) => point.remainder > 0)

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-tk-onyx">Monthly run rate</h2>
          <p className="mt-0.5 text-xs text-ink-3">{note}</p>
        </div>
        <div className="flex rounded-lg border border-line bg-well p-0.5">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                view === option.id
                  ? "bg-tk-onyx text-tk-linen"
                  : "text-ink-3 hover:text-tk-onyx"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pt-4">
        {view === "billed" ? (
          <BilledChart points={cash} goalCents={goalCents} />
        ) : null}
        {view === "clients" ? (
          <RevenueChart points={points} series={series} />
        ) : null}
        {view === "cash" ? <CashChart points={cash} goalCents={goalCents} /> : null}
        {view === "rate" ? <RateChart points={cash} /> : null}
      </div>

      {view === "billed" ? (
        <div className="flex flex-wrap gap-4 px-5 pb-4 pt-2 text-xs text-tk-slate">
          <Key color="#009688" label="Billed" />
          {hasRemainder ? (
            <Key color="#009688" opacity={0.34} label="Still to invoice" />
          ) : null}
          <Key
            color="#B07818"
            label={`3-month average · ${formatWholeMoney(latestAvg)}`}
          />
          {goalCents ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0 w-3 border-t-2 border-dashed border-tk-onyx/55" />
              Month goal {formatWholeMoney(goalCents)}
            </span>
          ) : null}
        </div>
      ) : view === "clients" ? (
        <div className="flex flex-wrap gap-4 px-5 pb-4 pt-2 text-xs text-tk-slate">
          {series.map((item) => (
            <Key key={item.slug} color={chartColor(item.slug)} label={item.name} />
          ))}
        </div>
      ) : view === "cash" ? (
        <div className="flex flex-wrap gap-4 px-5 pb-4 pt-2 text-xs text-tk-slate">
          <Key color="#009688" label="Billed" />
          <Key color="#4C74C9" label="Collected" />
          {cash.some((point) => point.expenses > 0) ? (
            <Key color="#B07818" label="Expenses" />
          ) : null}
          {goalCents ? (
            <span className="text-ink-3">
              Dashed line is the {formatMoney(goalCents)} monthly goal
            </span>
          ) : null}
        </div>
      ) : (
        <p className="px-5 pb-4 pt-2 text-xs text-ink-3">
          Invoices that carry hours, billed ÷ those hours. Months with only
          fixed-fee work stay blank.
        </p>
      )}
    </section>
  )
}
