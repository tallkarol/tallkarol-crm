import type { ReactNode } from "react"
import { CHART } from "@/lib/insights/chart"
import { Sparkline } from "@/components/insights/Sparkline"

/**
 * The portal's frozen twin of components/insights/KpiTile.
 *
 * FROZEN LITERALS — do not tokenise. This renders NINE times on
 * /portal/insights, which is why it is forked rather than shared: tokenising
 * the admin copy would un-freeze the client-facing route nine times over.
 *
 * Sparkline is NOT forked. It takes its colour as a prop, so the value below
 * decides what it paints, and CHART's light values are unchanged.
 */
export function PortalKpiTile({
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
  series?: "teal" | "amber" | "ink"
  footnote?: string
}) {
  const sparkColor = series === "amber" ? CHART.amber : series === "ink" ? CHART.ink : CHART.teal
  return (
    <div className="rounded-2xl border border-[#1F2C2B]/15 bg-[#FFFFFF] px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1F2C2B]/60">{label}</p>
      <p className="mt-1 text-[23px] font-semibold leading-tight text-[#0F1615]">{value}</p>
      {delta}
      {spark ? (
        <Sparkline values={spark} color={sparkColor} />
      ) : footnote ? (
        <p className="mt-3 text-[11px] text-[#1F2C2B]/50">{footnote}</p>
      ) : (
        <div className="mt-2 h-6" aria-hidden />
      )}
    </div>
  )
}
