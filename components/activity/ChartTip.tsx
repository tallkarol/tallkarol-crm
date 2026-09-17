"use client"

/** The one tooltip the activity charts share: values lead, labels follow, a short line key per series. */
export type TipRow = { value: string; label: string; color?: string }
export type TipState = { x: number; y: number; title: string; rows: TipRow[] } | null

export function ChartTip({ tip, width }: { tip: TipState; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 180))
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 min-w-[150px] rounded-[10px] border border-line-strong bg-card px-2.5 py-2 font-ui text-[12px] text-ink-2 shadow-overlay"
      style={{ left, top: Math.max(0, tip.y - 12) }}
    >
      <div className="mb-1 text-[11px] font-bold text-ink-3">{tip.title}</div>
      {tip.rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 leading-[1.7]">
          <i className="inline-block h-0.5 w-2.5 rounded-sm" style={{ background: row.color ?? "transparent" }} />
          <b className="min-w-[52px] font-bold tabular-nums text-ink">{row.value}</b>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  )
}
