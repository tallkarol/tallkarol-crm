import type { ReactNode } from "react"
import { CHART } from "@/lib/insights/chart"
import { cn } from "@/lib/cn"

export type Column = {
  key: string
  label: string
  align?: "left" | "right"
  /** Which column the share bar is scaled against; at most one per table. */
  share?: boolean
}

export type Row = { key: string; cells: Record<string, ReactNode>; shareValue?: number | null }

/**
 * One breakdown: a heading, a note that says what the rows mean, columns
 * right-aligned in tabular figures, and a share bar scaled against the
 * column's own window total. A cell that is "—" is an unknown, not a zero.
 */
export function BreakdownTable({
  title,
  note,
  columns,
  rows,
  empty = "nothing in this window",
}: {
  title: string
  note?: string
  columns: Column[]
  rows: Row[]
  empty?: string
}) {
  const shareTotal = rows.reduce((sum, r) => sum + (r.shareValue ?? 0), 0)
  return (
    <section>
      <h3 className="font-display text-[14px] font-semibold text-tk-onyx">{title}</h3>
      {note ? <p className="mt-0.5 text-[11.5px] leading-[1.45] text-ink-3">{note}</p> : null}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line font-ui text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
              {columns.map((c) => (
                <th key={c.key} className={cn("py-1.5 pr-3 font-bold", c.align === "right" ? "text-right" : "text-left")}>
                  {c.label}
                </th>
              ))}
              {shareTotal > 0 ? <th className="w-[96px] py-1.5 text-left font-bold">Share of known</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-3 text-ink-3">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const part = r.shareValue ?? 0
                const pct = shareTotal > 0 ? (part / shareTotal) * 100 : 0
                return (
                  <tr key={r.key} className="border-b border-line last:border-0">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "py-1.5 pr-3 align-top",
                          c.align === "right" ? "text-right font-mono text-[12px] tabular-nums text-tk-onyx" : "text-ink-2"
                        )}
                      >
                        {r.cells[c.key] ?? "—"}
                      </td>
                    ))}
                    {shareTotal > 0 ? (
                      <td className="py-1.5 align-middle">
                        {r.shareValue == null ? (
                          /* Unknown, not zero: no bar, no percent. */
                          <span className="font-mono text-[10.5px] text-ink-3">—</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="h-[5px] w-14 overflow-hidden rounded-full" style={{ background: CHART.track }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: CHART.teal }} />
                            </div>
                            <span className="font-mono text-[10.5px] tabular-nums text-ink-3">{`${Math.round(pct)}%`}</span>
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
