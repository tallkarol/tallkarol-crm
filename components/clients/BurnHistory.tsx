import { cn } from "@/lib/cn"

/**
 * Six months of retainer hours as thin bars against the ceiling. The current
 * month renders pale — it is still filling.
 */
export function BurnHistory({
  history,
  cap,
  currentMonth,
}: {
  history: { month: string; label: string; hours: number }[]
  cap: number
  currentMonth: string
}) {
  const max = Math.max(cap, ...history.map((h) => h.hours), 1)
  const label = history
    .map((h) => `${h.label} ${h.hours % 1 === 0 ? h.hours : h.hours.toFixed(1)}`)
    .join(", ")
  return (
    <figure className="m-0">
      <div
        className="flex h-[52px] items-end gap-1.5"
        role="img"
        aria-label={`Hours used by month: ${label}, of a ${cap} hour cap`}
      >
        {history.map((h) => (
          <div key={h.month} className="flex w-7 flex-col items-center gap-1">
            <div
              className={cn(
                "w-full rounded-t",
                h.month === currentMonth ? "bg-tk-teal/25" : "bg-tk-teal"
              )}
              style={{ height: `${Math.max(2, Math.round((h.hours / max) * 44))}px` }}
            />
            <span className="text-[9.5px] tabular-nums text-tk-slate/50">{h.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 text-[11px] text-tk-slate/50">
        Hours used, last 6 months · cap <span className="tabular-nums">{cap}</span>
      </figcaption>
    </figure>
  )
}
