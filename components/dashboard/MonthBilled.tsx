import Link from "next/link"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { formatMoney } from "@/lib/work"

export type MonthInvoiceLine = {
  number: string
  clientName: string
  clientSlug: string
  amountCents: number
  status: string
}

export type MonthExpectedLine = {
  label: string
  sub: string | null
  cents: number
  /** Client slug when the line belongs to one — colours its chip. */
  slug?: string | null
}

/**
 * Billed this month: the number against the goal, a two-tone bar (billed
 * solid, expected hatched), then every line that makes up the expectation.
 * Nothing folds away — the card earns its height with the itemization.
 */
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
  const pct = monthlyGoalCents ? Math.round((billedCents / monthlyGoalCents) * 100) : null
  const expectedPct = monthlyGoalCents
    ? Math.round((expectedTotalCents / monthlyGoalCents) * 100)
    : null

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-[18px] py-3">
        <h2 className="font-ui text-[13.5px] font-bold tracking-tight text-tk-onyx">
          Billed · {monthLabel}
        </h2>
        <Link
          href={ROUTES.invoices}
          className="font-ui text-xs font-bold text-ink-3 hover:text-tk-onyx hover:underline"
        >
          Invoices →
        </Link>
      </div>
      <div className="px-[18px] pb-3 pt-4">
        <p className="flex items-baseline gap-2.5">
          <span className="font-display text-[34px] font-semibold leading-none tracking-[-0.035em] text-tk-onyx tabular-nums">
            {formatMoney(billedCents)}
          </span>
          <span className="font-ui text-sm font-medium text-ink-3">
            {monthlyGoalCents ? (
              <>
                <b className="font-bold text-tk-onyx">{pct}%</b> of {formatMoney(monthlyGoalCents)} goal
              </>
            ) : invoices.length === 0 ? (
              "nothing invoiced yet"
            ) : (
              "this month"
            )}
          </span>
        </p>

        {monthlyGoalCents ? (
          <GoalBar
            billed={billedCents / monthlyGoalCents}
            expected={expectedTotalCents / monthlyGoalCents}
          />
        ) : null}

        <div className="mt-3 border-t border-line text-[12.5px]">
          {invoices.length === 0 && expected.length === 0 ? (
            <p className="py-3 text-xs text-ink-3">Nothing invoiced or expected yet this month.</p>
          ) : null}
          {invoices.map((i) => (
            <Link
              key={i.number}
              href={`/?peek=invoice:${encodeURIComponent(i.number)}`}
              scroll={false}
              className="grid h-8 grid-cols-[96px_1fr_auto] items-center gap-2.5 border-b border-line hover:bg-well transition-colors duration-[120ms]"
            >
              <ClientChip name={i.clientName} slug={i.clientSlug} />
              <span className="min-w-0 truncate text-ink-3">
                {i.number}
                {i.status !== "paid" ? (
                  <span
                    className={cn(
                      "ml-1.5 font-semibold",
                      i.status === "sent" ? "text-bad" : "text-warn"
                    )}
                  >
                    {i.status}
                  </span>
                ) : (
                  <span className="ml-1.5 text-ink-3">paid</span>
                )}
              </span>
              <span className="font-semibold tabular-nums text-tk-onyx">
                {formatMoney(i.amountCents)}
              </span>
            </Link>
          ))}
          {expected.map((line) => (
            <div
              key={line.label}
              className="grid h-8 grid-cols-[96px_1fr_auto] items-center gap-2.5 border-b border-line"
            >
              {line.slug ? (
                <ClientChip name={line.label} slug={line.slug} />
              ) : (
                <span className="min-w-0 truncate font-ui text-[11px] font-bold text-tk-onyx">
                  {line.label}
                </span>
              )}
              <span className="min-w-0 truncate italic text-ink-3">
                {line.sub ?? line.label}
                <span className="ml-1 text-[10px] uppercase tracking-wide not-italic">expected</span>
              </span>
              <span className="font-medium tabular-nums text-tk-slate">
                +{formatMoney(line.cents)}
              </span>
            </div>
          ))}
          {expected.length > 0 ? (
            <div className="grid h-9 grid-cols-[96px_1fr_auto] items-center gap-2.5">
              <span className="font-ui text-xs font-bold text-tk-slate">Expected</span>
              <span className="text-ink-3">
                {expectedPct != null ? (
                  <>
                    <b className="font-bold text-tk-onyx">{expectedPct}%</b> of goal
                  </>
                ) : (
                  `by end of ${monthLabel}`
                )}
              </span>
              <span className="font-bold tabular-nums text-tk-onyx">
                {formatMoney(expectedTotalCents)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ClientChip({ name, slug }: { name: string; slug: string }) {
  return (
    <span
      className="tk-client-tint tk-client-ink inline-flex h-[18px] max-w-full items-center gap-1 self-center justify-self-start rounded-md px-1.5 font-ui text-[10px] font-bold"
      style={{ "--c": clientColor(slug) } as React.CSSProperties}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--c)" }} />
      <span className="truncate">{name}</span>
    </span>
  )
}

function GoalBar({ billed, expected }: { billed: number; expected: number }) {
  const clamp = (f: number) => Math.max(0, Math.min(1, f))
  return (
    <span
      role="img"
      aria-label={`${Math.round(billed * 100)}% billed, ${Math.round(expected * 100)}% expected`}
      className="relative mt-3 block h-2 overflow-hidden rounded-full border border-line bg-well"
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full border-r border-tk-teal transition-[width] duration-700 ease-out"
        style={{
          width: `${(clamp(expected) * 100).toFixed(1)}%`,
          backgroundImage:
            "repeating-linear-gradient(135deg, rgb(var(--accent-rgb) / 0.22) 0 4px, transparent 4px 8px)",
        }}
      />
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700 ease-out"
        style={{ width: `${(clamp(billed) * 100).toFixed(1)}%` }}
      />
    </span>
  )
}
