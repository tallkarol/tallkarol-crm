import type { ReactNode } from "react"
import { CHART } from "@/lib/insights/chart"
import { cn } from "@/lib/cn"

export function Card({
  title,
  note,
  right,
  children,
  className,
}: {
  title: string
  note?: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-card shadow-card",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">{title}</h2>
        {right ??
          (note ? (
            <p className="text-xs tabular-nums text-ink-3">{note}</p>
          ) : null)}
      </div>
      {children}
    </section>
  )
}

export function Delta({
  pct,
  suffix,
}: {
  pct: number | null
  suffix: string
}) {
  if (pct == null) {
    return <p className="mt-1 text-[11px] text-ink-3">no prior window</p>
  }
  if (pct === 0) {
    return (
      <p className="mt-1 text-[11px] font-medium text-ink-3">
        — unchanged {suffix}
      </p>
    )
  }
  const up = pct > 0
  const magnitude = Math.abs(pct)
  const text =
    magnitude >= 10 ? `${Math.round(magnitude)}%` : `${magnitude.toFixed(1)}%`
  return (
    <p
      className="mt-1 text-[11px] font-bold"
      style={{ color: up ? CHART.good : CHART.bad }}
    >
      {up ? "▲" : "▼"} {text}{" "}
      <span className="font-medium text-ink-3">{suffix}</span>
    </p>
  )
}

export function Kpi({
  label,
  value,
  delta,
  sub,
}: {
  label: string
  value: string
  delta?: ReactNode
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-5 py-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-tk-onyx tabular-nums">
        {value}
      </p>
      {delta}
      {sub ? <p className="mt-1 text-xs text-ink-3">{sub}</p> : null}
    </div>
  )
}

export function ChartTip({
  label,
  rows,
}: {
  label: string
  rows: { color?: string; name: string; value: string }[]
}) {
  return (
    <div className="rounded-xl bg-tk-onyx px-3 py-2 text-xs text-tk-linen shadow-overlay">
      <p className="font-semibold">{label}</p>
      <div className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <p
            key={row.name}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5">
              {row.color ? (
                <span
                  className="inline-block size-2 rounded-[3px]"
                  style={{ background: row.color }}
                />
              ) : null}
              {row.name}
            </span>
            <span className="font-semibold tabular-nums">{row.value}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

export const MIX_COLORS: Record<string, string> = {
  retainer: "#009688",
  project: "#B07818",
  other: "#9AA6A2",
  paid: "#009688",
  sent: "#A62228",
  draft: "#B07818",
}
