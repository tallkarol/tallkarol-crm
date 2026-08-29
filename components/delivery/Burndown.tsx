import { cn } from "@/lib/cn"

export type BurndownMonth = {
  key: string
  label: string
  hours: number
  /** True when the figure came from an invoice rather than logged time. */
  billed: boolean
  current: boolean
}

/**
 * Hours per month against the retainer's ceiling.
 *
 * The bars are scaled to the ceiling, not to the tallest month, so the empty
 * space above a bar is the headroom that was actually left — which is the
 * whole point of drawing it.
 */
export function Burndown({ months, cap }: { months: BurndownMonth[]; cap: number }) {
  if (months.length === 0) {
    return (
      <p className="rounded-xl border border-tk-slate/15 bg-white px-3 py-2.5 text-[11.5px] text-tk-slate/65">
        No hours recorded yet.
      </p>
    )
  }
  const ceiling = Math.max(cap, ...months.map((m) => m.hours))
  const anyBilled = months.some((m) => m.billed)

  return (
    <div>
      <div className="relative flex h-[104px] items-end gap-2 rounded-xl border border-tk-slate/15 bg-white px-3 pb-0 pt-3.5">
        {cap > 0 ? (
          <>
            <span
              aria-hidden
              className="absolute inset-x-3 border-t border-dashed border-[#B4322A]/45"
              style={{ bottom: `calc(18px + ${(cap / ceiling) * 68}px)` }}
            />
            <span className="absolute right-3 top-0.5 font-mono text-[9px] text-[#B4322A]">
              {cap}h ceiling
            </span>
          </>
        ) : null}
        {months.map((m) => (
          <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="font-mono text-[9.5px] font-semibold tabular-nums text-tk-slate">
              {m.hours.toFixed(1)}
            </span>
            <span
              title={`${m.label}: ${m.hours.toFixed(1)}h${m.billed ? " (from the invoice)" : ""}`}
              className={cn(
                "w-full max-w-[36px] rounded-t-[3px]",
                m.current ? "bg-tk-teal" : m.billed ? "bg-tk-teal/25" : "bg-tk-teal/40",
                m.hours > cap && cap > 0 && "bg-[#B4322A]"
              )}
              style={{ height: `${Math.max(2, (m.hours / ceiling) * 68)}px` }}
            />
            <span className="font-mono text-[9px] uppercase text-tk-slate/45">{m.label}</span>
          </div>
        ))}
      </div>
      {anyBilled ? (
        <p className="mt-1.5 text-[10.5px] text-tk-slate/55">
          Paler bars are reconstructed from that month&rsquo;s invoice — they predate the timesheet.
        </p>
      ) : null}
    </div>
  )
}
