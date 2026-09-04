import Link from "next/link"
import { Badge } from "@/components/work/Badge"
import { SheetFilters } from "@/components/timesheet/SheetFilters"
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import {
  SHEET_STATE_LABEL,
  listSheets,
  sheetYears,
  type SheetState,
  type SheetSummary,
} from "@/lib/sheets"
import { monthLong } from "@/lib/timesheet"
import { formatMoney } from "@/lib/work"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Sheets" }
export const dynamic = "force-dynamic"

/**
 * Every client-month that has hours on it, grouped by what you would do next.
 * Defaults to this year and hides settled sheets, so a year-old month is one
 * deliberate click away instead of sitting next to a live one.
 */

type Group = {
  key: string
  title: string
  note: string
  states: SheetState[]
  collapsed?: boolean
}

const GROUPS: Group[] = [
  {
    key: "open",
    title: "Open",
    note: "This month, and anything still being logged.",
    states: ["open"],
  },
  {
    key: "unbilled",
    title: "Closed but unbilled",
    note: "Months that ended with hours nobody invoiced.",
    states: ["unbilled"],
  },
  {
    key: "invoiced",
    title: "Invoiced, awaiting payment",
    note: "",
    states: ["invoiced"],
  },
  {
    key: "paid",
    title: "Paid and closed",
    note: "",
    states: ["paid"],
    collapsed: true,
  },
]

export default async function SheetsPage({
  searchParams,
}: {
  searchParams: { year?: string; client?: string; show?: string }
}) {
  const [sheets, years] = await Promise.all([listSheets(), sheetYears()])

  const thisYear = String(new Date().getFullYear())
  const year =
    searchParams.year === "all"
      ? "all"
      : years.includes(searchParams.year ?? "")
        ? (searchParams.year as string)
        : years.includes(thisYear)
          ? thisYear
          : (years[0] ?? thisYear)

  const clientSlug = searchParams.client ?? ""
  const showSettled = searchParams.show === "all"

  const clientOptions = Array.from(
    new Map(sheets.map((row) => [row.clientSlug, row.clientName])).entries()
  )
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const visible = sheets.filter((row) => {
    if (year !== "all" && !row.month.startsWith(year)) return false
    if (clientSlug && row.clientSlug !== clientSlug) return false
    if (!showSettled && row.state === "paid") return false
    return true
  })

  const totalHours = visible.reduce((sum, row) => sum + row.hours, 0)
  const totalCents = visible.reduce((sum, row) => sum + (row.valueCents ?? 0), 0)
  const hiddenPaid = sheets.filter(
    (row) =>
      row.state === "paid" &&
      (year === "all" || row.month.startsWith(year)) &&
      (!clientSlug || row.clientSlug === clientSlug)
  ).length

  return (
    <>
      <SheetFilters
        years={years}
        year={year}
        clients={clientOptions}
        clientSlug={clientSlug}
        showSettled={showSettled}
        summary={`${visible.length} ${visible.length === 1 ? "sheet" : "sheets"} · ${round(totalHours)} hr${totalCents > 0 ? ` · ${formatMoney(totalCents)}` : ""}`}
      />

      {visible.length === 0 ? (
        <Card surface="well" className="mt-6 border-dashed px-6 py-10 text-center">
          <p className="text-sm font-semibold text-tk-onyx">No sheets here</p>
          <p className="mt-1 text-sm text-ink-3">
            A sheet appears once its month has hours on it. Widen the year or
            client filter to see more.
          </p>
        </Card>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          {GROUPS.map((group) => {
            const rows = visible.filter((row) => group.states.includes(row.state))
            if (rows.length === 0) return null
            return <SheetGroup key={group.key} group={group} rows={rows} />
          })}
        </div>
      )}

      {!showSettled && hiddenPaid > 0 ? (
        <p className="mt-4 text-sm text-ink-3">
          {hiddenPaid} paid {hiddenPaid === 1 ? "sheet is" : "sheets are"} hidden.{" "}
          <Link
            href={buildHref({ year, client: clientSlug, show: "all" })}
            className="font-semibold text-tk-teal hover:underline"
          >
            Show them
          </Link>
        </p>
      ) : null}
    </>
  )
}

function SheetGroup({ group, rows }: { group: Group; rows: SheetSummary[] }) {
  const hours = rows.reduce((sum, row) => sum + row.hours, 0)
  const unbilled = rows.reduce((sum, row) => sum + row.unbilledHours, 0)
  const value = rows.reduce((sum, row) => sum + (row.valueCents ?? 0), 0)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line bg-well px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-tk-onyx">{group.title}</h2>
          {group.note ? (
            <p className="mt-0.5 text-xs text-ink-3">{group.note}</p>
          ) : null}
        </div>
        <p className="font-mono text-xs tabular-nums text-ink-3">
          {rows.length} · {round(hours)} hr
          {unbilled > 0 ? ` · ${round(unbilled)} hr unbilled` : ""}
          {value > 0 ? ` · ${formatMoney(value)}` : ""}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              <th className="px-5 py-2 font-semibold">Client</th>
              <th className="px-3 py-2 font-semibold">Month</th>
              <th className="px-3 py-2 text-right font-semibold">Hours</th>
              <th className="px-3 py-2 text-right font-semibold">Value</th>
              <th className="px-3 py-2 font-semibold">State</th>
              <th className="px-3 py-2 font-semibold">Invoice</th>
              <th className="px-5 py-2 text-right font-semibold">Last entry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-line transition-colors last:border-0 hover:bg-well"
              >
                <td className="px-5 py-2.5">
                  <Link
                    href={ROUTES.timesheetFor(row.clientSlug, row.month)}
                    className="flex items-center gap-2 font-medium text-tk-onyx hover:text-tk-teal"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: markColor(clientColor(row.clientSlug)) }}
                    />
                    {row.clientName}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-tk-slate">
                  <Link
                    href={ROUTES.timesheetFor(row.clientSlug, row.month)}
                    className="hover:text-tk-teal"
                  >
                    {monthLong(row.month)}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-tk-slate">
                  {round(row.hours)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-tk-slate">
                  {row.valueCents != null ? formatMoney(row.valueCents) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <StateBadge state={row.state} />
                </td>
                <td className="px-3 py-2.5">
                  {row.invoiceNumber ? (
                    <Link
                      href={ROUTES.invoice(row.invoiceNumber)}
                      className="font-mono text-xs font-semibold text-tk-teal hover:underline"
                    >
                      {row.invoiceNumber}
                    </Link>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right text-xs text-ink-3">
                  {shortDay(row.lastEditedOn)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function StateBadge({ state }: { state: SheetState }) {
  const tone =
    state === "open" ? "teal" : state === "unbilled" ? "neutral" : "muted"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        state === "open" && "bg-tk-teal/10 text-tk-teal",
        state === "unbilled" && "bg-amber-100 text-amber-800",
        state === "invoiced" && "bg-well text-tk-slate",
        state === "paid" && "bg-well text-ink-3"
      )}
      data-tone={tone}
    >
      {SHEET_STATE_LABEL[state]}
    </span>
  )
}

function buildHref(params: { year: string; client: string; show?: string }) {
  const search = new URLSearchParams()
  if (params.year) search.set("year", params.year)
  if (params.client) search.set("client", params.client)
  if (params.show) search.set("show", params.show)
  const query = search.toString()
  return query ? `${ROUTES.timesheetSheets}?${query}` : ROUTES.timesheetSheets
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

function shortDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  })
}
