import { clientColor, markColor } from "@/lib/client-colors"
import { fmtHours } from "@/lib/engagements"
import type { ClientRow } from "@/lib/revenue"
import { formatMoney } from "@/lib/work"

export function RateBars({ rows }: { rows: ClientRow[] }) {
  const ranked = rows
    .filter((row) => row.hourlyCents != null)
    .sort((a, b) => (b.hourlyCents ?? 0) - (a.hourlyCents ?? 0))
  const max = Math.max(...ranked.map((row) => row.hourlyCents ?? 0), 1)

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Per hour</h2>
        <p className="mt-0.5 text-xs text-ink-3">
          Billed ÷ hours on the invoice
        </p>
      </div>
      {ranked.length === 0 ? (
        <p className="px-5 py-8 text-sm text-ink-3">
          No hourly invoices in this window.
        </p>
      ) : (
        <ul className="space-y-2.5 px-5 py-4">
          {ranked.map((row) => {
            const color = clientColor(row.slug)
            const rate = row.hourlyCents ?? 0
            return (
              <li
                key={row.slug}
                className="grid grid-cols-[minmax(0,8rem)_1fr_4.75rem] items-center gap-3 text-xs"
              >
                <p className="truncate font-semibold" style={{ color }}>
                  {row.name}
                </p>
                <div className="flex h-[13px] items-center">
                  <span
                    className="h-[13px] rounded-r"
                    style={{
                      width: `${Math.max((rate / max) * 100, 4)}%`,
                      background: markColor(color),
                    }}
                  />
                </div>
                <p className="text-right tabular-nums">
                  <span className="font-semibold text-tk-onyx">
                    {formatMoney(rate)}
                  </span>
                  <span className="block text-[10px] font-medium text-ink-3">
                    {fmtHours(row.invoiceHours)} hr
                  </span>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
