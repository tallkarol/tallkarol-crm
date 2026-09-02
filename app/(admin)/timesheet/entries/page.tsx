import Link from "next/link"
import { asc } from "drizzle-orm"
import { LedgerFilters } from "@/components/timesheet/LedgerFilters"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"
import { ledgerEntries } from "@/lib/sheets"
import { formatSheetHours } from "@/lib/timesheet"

export const metadata = { title: "Ledger" }
export const dynamic = "force-dynamic"

const SOURCE_LABEL: Record<string, string> = {
  manual: "man",
  clock: "clock",
  meeting: "cal",
  agent: "agent",
}

/**
 * One flat table across every client and every month. Deliberately boring —
 * it is the only view that answers "when did I do that, and how long did it
 * take" without knowing the month first.
 */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: {
    q?: string
    client?: string
    from?: string
    to?: string
    source?: string
    missing?: string
  }
}) {
  const clientRows = await db.query.clients.findMany({
    orderBy: [asc(clients.name)],
  })

  const { rows, total, hours, truncated } = await ledgerEntries({
    q: searchParams.q,
    clientSlug: searchParams.client,
    from: isDay(searchParams.from) ? searchParams.from : undefined,
    to: isDay(searchParams.to) ? searchParams.to : undefined,
    source: searchParams.source,
  })

  // "Entries with no summary" is a fix-list, so it filters the page rather
  // than the query — the totals above stay honest about the whole filter set.
  const missingSummary = searchParams.missing === "summary"
  const visible = missingSummary ? rows.filter((row) => !row.summary.trim()) : rows

  return (
    <>
      <LedgerFilters
        clients={clientRows.map((row) => ({ slug: row.slug, name: row.name }))}
        q={searchParams.q ?? ""}
        clientSlug={searchParams.client ?? ""}
        from={searchParams.from ?? ""}
        to={searchParams.to ?? ""}
        source={searchParams.source ?? ""}
        missingSummary={missingSummary}
        summary={`${missingSummary ? visible.length : total} ${(missingSummary ? visible.length : total) === 1 ? "entry" : "entries"} · ${hours} hr`}
      />

      {visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-tk-onyx">Nothing matches</p>
          <p className="mt-1 text-sm text-tk-slate/70">
            Try a shorter search, a wider date range, or clear the client filter.
          </p>
        </div>
      ) : (
        <section className="mt-5 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-tk-slate/15 bg-tk-linen/50 text-left text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
                  <th className="px-5 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Client</th>
                  <th className="px-3 py-2 font-semibold">Project</th>
                  <th className="px-3 py-2 font-semibold">Session highlights</th>
                  <th className="px-3 py-2 text-right font-semibold">Hrs</th>
                  <th className="px-3 py-2 font-semibold">Src</th>
                  <th className="px-5 py-2 font-semibold">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-tk-slate/10 last:border-0 hover:bg-tk-linen/40"
                  >
                    <td className="whitespace-nowrap px-5 py-2.5 text-tk-slate">
                      <Link
                        href={ROUTES.timesheetFor(
                          row.clientSlug,
                          row.occurredOn.slice(0, 7)
                        )}
                        className="hover:text-tk-teal"
                      >
                        {dayLabel(row.occurredOn)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="flex items-center gap-2 text-tk-onyx">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: clientColor(row.clientSlug) }}
                        />
                        {row.clientName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-tk-slate/70">
                      {row.projectName ?? (
                        <span className="text-tk-slate/40">retainer</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-tk-slate">
                      {row.summary || (
                        <span className="text-amber-700">no summary</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-tk-slate">
                      {formatSheetHours(row.hours)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-tk-linen px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tk-slate/70">
                        {SOURCE_LABEL[row.source] ?? row.source}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      {row.invoiceNumber ? (
                        <Link
                          href={ROUTES.invoice(row.invoiceNumber)}
                          className="font-mono text-xs font-semibold text-tk-teal hover:underline"
                        >
                          {row.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-tk-slate/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {truncated ? (
        <p className="mt-3 text-sm text-tk-slate/55">
          Showing the 500 most recent matches of {total}. Narrow the date range
          to see the rest.
        </p>
      ) : null}
    </>
  )
}

function isDay(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function dayLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  })
}
