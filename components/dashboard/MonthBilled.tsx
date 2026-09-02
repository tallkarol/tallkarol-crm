import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { formatMoney } from "@/lib/work"

export type MonthInvoiceLine = {
  number: string
  clientName: string
  amountCents: number
  status: string
}

export type MonthExpectedLine = {
  label: string
  sub: string | null
  cents: number
}

/** Billed this month — the dropdown itemizes what was billed and what the
    month is still expected to produce. */
export function MonthBilled({
  monthLabel,
  billedCents,
  monthlyGoalCents,
  invoices,
  expected,
  expectedTotalCents,
}: {
  monthLabel: string
  billedCents: number
  monthlyGoalCents: number | null
  invoices: MonthInvoiceLine[]
  expected: MonthExpectedLine[]
  expectedTotalCents: number
}) {
  return (
    <details className="group min-w-0 rounded-2xl border border-tk-slate/15 bg-white shadow-sm open:[&_svg]:rotate-0">
      <summary className="flex min-w-0 cursor-pointer list-none flex-col px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-tk-slate/70">
            Billed in {monthLabel}
          </p>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 -rotate-90 text-tk-slate/50 transition-transform duration-200 motion-reduce:transition-none"
          />
        </div>
        <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
          <p className="shrink-0 text-2xl font-semibold tracking-tight text-tk-onyx tabular-nums">
            {formatMoney(billedCents)}
          </p>
          <p className="min-w-0 truncate text-right text-xs text-tk-slate/60">
            {monthlyGoalCents ? (
              <>
                <span className="font-semibold text-tk-teal">
                  {Math.round((billedCents / monthlyGoalCents) * 100)}%
                </span>{" "}
                of {formatMoney(monthlyGoalCents)} month goal
              </>
            ) : invoices.length === 0 ? (
              "No invoices yet this month"
            ) : (
              "this month"
            )}
          </p>
        </div>
        {monthlyGoalCents ? <MonthBar fraction={billedCents / monthlyGoalCents} /> : null}
      </summary>
      <div className="border-t border-tk-slate/10 px-5 py-3">
        <ul className="space-y-1.5">
          {invoices.length === 0 ? (
            <li className="text-xs text-tk-slate/60">Nothing invoiced yet this month.</li>
          ) : (
            invoices.map((i) => (
              <li
                key={i.number}
                className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-tk-slate/70">
                  <Link
                    href={`/?peek=invoice:${encodeURIComponent(i.number)}`}
                    scroll={false}
                    className="font-medium text-tk-teal hover:underline"
                  >
                    {i.number}
                  </Link>{" "}
                  · {i.clientName}
                  {i.status !== "paid" ? (
                    <span
                      className={
                        i.status === "sent"
                          ? "ml-1.5 font-semibold text-red-700"
                          : "ml-1.5 font-semibold text-amber-800"
                      }
                    >
                      {i.status}
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums font-medium text-tk-onyx">
                  {formatMoney(i.amountCents)}
                </span>
              </li>
            ))
          )}
          {expected.map((line) => (
            <li
              key={line.label}
              className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs opacity-50"
            >
              <span className="min-w-0 truncate italic text-tk-slate/70">
                {line.label}
                {line.sub ? (
                  <span className="ml-1 text-[10px] not-italic">· {line.sub}</span>
                ) : null}
                <span className="ml-1 text-[10px] uppercase tracking-wide">expected</span>
              </span>
              <span className="tabular-nums font-medium text-tk-slate">
                +{formatMoney(line.cents)}
              </span>
            </li>
          ))}
          {expected.length > 0 ? (
            <li className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-3 border-t border-tk-slate/10 pt-2 text-xs">
              <span className="font-semibold text-tk-slate">
                Expected {monthLabel} total
              </span>
              <span className="tabular-nums font-bold text-tk-teal">
                {formatMoney(expectedTotalCents)}
              </span>
            </li>
          ) : null}
        </ul>
      </div>
    </details>
  )
}

function MonthBar({ fraction }: { fraction: number }) {
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <span className="mt-2.5 block h-2 overflow-hidden rounded-full bg-tk-linen">
      <span
        className="block h-full rounded-full bg-tk-teal"
        style={{ width: `${(f * 100).toFixed(1)}%` }}
      />
    </span>
  )
}
