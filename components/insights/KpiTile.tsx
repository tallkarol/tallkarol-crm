import type { ReactNode } from "react"
import { CHART } from "@/lib/insights/chart"
import { Sparkline } from "@/components/insights/Sparkline"

export function Delta({
  pct,
  abs,
  goodWhenUp = true,
  suffix = "vs prev",
}: {
  /** Percent change; null renders the no-prior-window note. */
  pct?: number | null
  /** Absolute change — used when a percent would mislead (tiny bases). */
  abs?: number | null
  goodWhenUp?: boolean
  suffix?: string
}) {
  const value = abs ?? pct
  if (value == null) {
    return <p className="mt-0.5 text-[11px] font-medium text-tk-slate/50">no prior window</p>
  }
  const up = value > 0
  const flat = value === 0
  const good = flat ? null : up === goodWhenUp
  const color = flat ? "#6C7975" : good ? CHART.good : CHART.bad
  const magnitude = Math.abs(value)
  const text =
    abs != null
      ? `${up ? "+" : "−"}${magnitude.toLocaleString("en-US")}`
      : `${magnitude >= 100 ? Math.round(magnitude) : magnitude.toFixed(magnitude < 10 ? 1 : 0)}%`
  return (
    <p className="mt-0.5 text-[11px] font-bold" style={{ color }}>
      {flat ? "—" : up ? "▲" : "▼"} {text}{" "}
      <span className="font-medium text-tk-slate/55">{suffix}</span>
    </p>
  )
}

/** Position is inverted — fewer is better — so it gets its own wording. */
export function PositionKpiDelta({
  current,
  previous,
}: {
  current: number | null
  previous: number | null
}) {
  if (current == null || previous == null) {
    return <p className="mt-0.5 text-[11px] font-medium text-tk-slate/50">no prior window</p>
  }
  const moved = previous - current
  if (Math.abs(moved) < 0.05) {
    return <p className="mt-0.5 text-[11px] font-medium text-tk-slate/50">— unchanged</p>
  }
  const better = moved > 0
  return (
    <p
      className="mt-0.5 text-[11px] font-bold"
      style={{ color: better ? CHART.good : CHART.bad }}
    >
      {better ? "▲" : "▼"} {Math.abs(moved).toFixed(1)}{" "}
      <span className="font-medium text-tk-slate/55">{better ? "better" : "worse"}</span>
    </p>
  )
}

export function KpiTile({
  label,
  value,
  delta,
  spark,
  series = "teal",
  footnote,
}: {
  label: string
  value: string
  delta: ReactNode
  spark?: number[]
  series?: "teal" | "amber"
  footnote?: string
}) {
  return (
    <div className="rounded-2xl border border-tk-slate/15 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
        {label}
      </p>
      <p className="mt-1 text-[23px] font-semibold leading-tight text-tk-onyx">{value}</p>
      {delta}
      {spark ? (
        <Sparkline values={spark} color={series === "teal" ? CHART.teal : CHART.amber} />
      ) : footnote ? (
        <p className="mt-3 text-[11px] text-tk-slate/50">{footnote}</p>
      ) : (
        <div className="mt-2 h-6" aria-hidden />
      )}
    </div>
  )
}
