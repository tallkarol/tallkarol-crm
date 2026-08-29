import Link from "next/link"
import { MiniBars } from "@/components/engagements/MiniBars"
import { clientColor } from "@/lib/client-colors"
import { fmtHours } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import type { ClientRow } from "@/lib/revenue"
import { formatMoney } from "@/lib/work"

function mixLabel(row: ClientRow) {
  const parts: string[] = []
  if (row.retainerCents) parts.push("retainer")
  if (row.projectCents) parts.push("project")
  if (row.otherCents) parts.push("other")
  return parts.join(" · ") || "—"
}

export function ClientTable({
  rows,
  periodLabel,
  quarterLabel,
  blendedCents,
}: {
  rows: ClientRow[]
  periodLabel: string
  quarterLabel: string
  blendedCents: number | null
}) {
  const billed = rows.reduce((sum, row) => sum + row.billedCents, 0)

  return (
    <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-tk-slate/10 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-tk-onyx">Per client</h2>
          <p className="mt-0.5 text-xs text-tk-slate/60">
            {periodLabel} · rate is billed hours only · bars are the last 12 months
          </p>
        </div>
        <p className="text-xs tabular-nums text-tk-slate/60">
          {formatMoney(billed)}
          {blendedCents != null ? ` · ${formatMoney(blendedCents)}/hr blended` : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-tk-slate/70">
          No invoices in this window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[50rem] text-left text-sm">
            <thead>
              <tr className="border-b border-tk-slate/10 text-[11px] font-semibold uppercase tracking-wider text-tk-slate/60">
                <th className="px-5 py-2.5 font-semibold">Client</th>
                <th className="px-3 py-2.5 text-right font-semibold">Billed</th>
                <th className="px-3 py-2.5 text-right font-semibold">Hours</th>
                <th className="px-3 py-2.5 text-right font-semibold">Rate</th>
                <th className="min-w-[9rem] px-3 py-2.5 font-semibold">Share</th>
                <th className="px-3 py-2.5 text-right font-semibold">
                  {quarterLabel}
                </th>
                <th className="px-3 py-2.5 text-right font-semibold">Logged</th>
                <th className="w-36 px-3 py-2.5 font-semibold">12 mo</th>
                <th className="px-5 py-2.5 font-semibold">Kind</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const color = clientColor(row.slug)
                return (
                  <tr
                    key={row.slug}
                    className="border-b border-tk-slate/10 last:border-0"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={ROUTES.client(row.slug)}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        style={{ color }}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        {row.name}
                      </Link>
                      {row.outstandingCents > 0 ? (
                        <p className="mt-0.5 text-[11px] font-semibold text-red-700">
                          {formatMoney(row.outstandingCents)} outstanding
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-tk-onyx">
                      {formatMoney(row.billedCents)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-tk-slate/80">
                      {row.invoiceHours > 0 ? fmtHours(row.invoiceHours) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-tk-onyx">
                      {row.hourlyCents != null
                        ? `${formatMoney(row.hourlyCents)}/hr`
                        : "fixed"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-tk-linen">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.max(row.share * 100, 1)}%`,
                              background: color,
                            }}
                          />
                        </span>
                        <span className="w-8 text-right text-xs tabular-nums text-tk-slate/70">
                          {Math.round(row.share * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-tk-slate/80">
                      {row.quarterCents > 0 ? formatMoney(row.quarterCents) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-tk-slate/70">
                      {row.loggedHours > 0 ? fmtHours(row.loggedHours) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <MiniBars values={row.spark} label={`${row.name} last 12 months`} />
                    </td>
                    <td className="px-5 py-3 text-xs text-tk-slate/60">
                      {mixLabel(row)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
