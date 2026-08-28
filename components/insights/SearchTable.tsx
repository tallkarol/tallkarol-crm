import { PositionDelta } from "@/components/insights/PositionDelta"
import { fmtInt, fmtPct01 } from "@/lib/insights/derive"
import type { SearchRow } from "@/lib/insights/types"

/** Queries or pages from Search Console, with position movement. */
export function SearchTable({
  rows,
  nameHeader,
  limit,
}: {
  rows: SearchRow[]
  nameHeader: string
  limit?: number
}) {
  const shown = limit ? rows.slice(0, limit) : rows
  if (shown.length === 0) {
    return <p className="px-5 py-6 text-sm text-tk-slate/70">Nothing in this window.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-tk-slate/12 text-left text-[10px] font-bold uppercase tracking-wide text-tk-slate/55">
            <th className="px-5 py-2 font-bold">{nameHeader}</th>
            <th className="px-3 py-2 text-right font-bold">Clicks</th>
            <th className="px-3 py-2 text-right font-bold">Impressions</th>
            <th className="px-3 py-2 text-right font-bold">CTR</th>
            <th className="px-3 py-2 text-right font-bold">Position</th>
            <th className="px-5 py-2 text-right font-bold">Δ pos</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.name} className="border-b border-tk-slate/[.06] last:border-0">
              <td className="max-w-[22rem] truncate px-5 py-2 font-medium text-tk-onyx" title={row.name}>
                {row.name}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">{fmtInt(row.clicks)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">{fmtInt(row.impressions)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">{fmtPct01(row.ctr)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">{row.position.toFixed(1)}</td>
              <td className="px-5 py-2 text-right">
                <PositionDelta position={row.position} prevPosition={row.prevPosition} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
