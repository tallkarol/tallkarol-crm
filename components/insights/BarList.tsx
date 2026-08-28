import { CHART } from "@/lib/insights/chart"
import { fmtInt } from "@/lib/insights/derive"

/**
 * Horizontal bar list for one measure — thin marks, rounded data end, value at
 * the tip with share in muted ink. Server-rendered.
 */
export function BarList({
  rows,
  total,
  color = CHART.teal,
  emptyText = "Nothing in this window.",
}: {
  rows: { name: string; value: number }[]
  total?: number
  color?: string
  emptyText?: string
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-tk-slate/70">{emptyText}</p>
  }
  const max = Math.max(...rows.map((r) => r.value), 1)
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0)
  return (
    <div className="flex flex-col gap-2.5 px-5 py-4">
      {rows.map((row) => (
        <div
          key={row.name}
          className="grid grid-cols-[minmax(0,9rem)_1fr_5rem] items-center gap-3 text-xs"
        >
          <p className="truncate font-medium text-tk-onyx" title={row.name}>
            {row.name}
          </p>
          <div className="flex h-[13px] items-center">
            <span
              className="h-[13px] rounded-r"
              style={{
                width: `${Math.max((row.value / max) * 100, 1)}%`,
                background: color,
              }}
            />
          </div>
          <p className="text-right font-semibold tabular-nums text-tk-onyx">
            {fmtInt(row.value)}
            {sum > 0 ? (
              <span className="ml-1 font-medium text-tk-slate/50">
                {Math.round((row.value / sum) * 100)}%
              </span>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  )
}

/** Share meters (devices): filled step of the ramp on a lighter track. */
export function MeterList({ rows }: { rows: { name: string; value: number }[] }) {
  const sum = rows.reduce((s, r) => s + r.value, 0)
  if (sum === 0) {
    return <p className="px-5 py-6 text-sm text-tk-slate/70">Nothing in this window.</p>
  }
  return (
    <div className="flex flex-col gap-2.5 px-5 py-4">
      {rows.map((row) => {
        const share = Math.round((row.value / sum) * 100)
        return (
          <div
            key={row.name}
            className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-xs"
          >
            <p className="font-medium capitalize text-tk-onyx">{row.name}</p>
            <div className="h-2 overflow-hidden rounded-full bg-[#D9EEEB]">
              <span
                className="block h-full rounded-full"
                style={{ width: `${share}%`, background: CHART.teal }}
              />
            </div>
            <p className="text-right font-semibold tabular-nums text-tk-onyx">{share}%</p>
          </div>
        )
      })}
    </div>
  )
}
