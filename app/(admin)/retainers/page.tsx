import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { MiniBars } from "@/components/engagements/MiniBars"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { db } from "@/db"
import { clientColor, markColor } from "@/lib/client-colors"
import {
  billingGaps,
  fmtHours,
  hoursByMonth,
  monthLabel,
  monthsLeft,
  pace,
  retainerRateCents,
  ym,
} from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import { ensureRenewalTasks } from "@/lib/renewals"
import { formatMoney, plural } from "@/lib/work"
import { draftRetainerInvoice, getWriteoffs, writeOffGap } from "./actions"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Retainers" }
export const dynamic = "force-dynamic"

export default async function RetainersPage({
  searchParams,
}: {
  searchParams: { peek?: string }
}) {
  await ensureRenewalTasks()
  const [retainers, invoices, entries, openTasks, sites, expenses, writeoffs] =
    await Promise.all([
      db.query.retainers.findMany({ with: { client: true } }),
      db.query.invoices.findMany(),
      db.query.timeEntries.findMany(),
      db.query.tasks.findMany().then((rows) => rows.filter((t) => t.status === "open")),
      db.query.sites.findMany().catch(() => []),
      db.query.expenses.findMany().catch(() => []),
      getWriteoffs(),
    ])

  const now = new Date()
  const thisMonth = ym(now)
  const active = retainers.filter((r) => r.status === "active")

  /* ---- KPIs ---- */
  const withRate = active.map((r) => ({ r, rate: retainerRateCents(r, invoices) }))
  const baseCents = withRate.reduce(
    (s, { r, rate }) => s + (rate ? rate * r.hoursPerMonth : 0),
    0
  )
  const capacity = active.reduce((s, r) => s + r.hoursPerMonth, 0)

  const retainerInvoices = invoices.filter((i) => i.retainerId)
  const unpaid = retainerInvoices
    .filter((i) => i.status === "sent")
    .sort((a, b) => (a.issuedOn < b.issuedOn ? -1 : 1))
  const outstandingCents = unpaid.reduce((s, i) => s + i.amountCents, 0)
  const oldestDays = unpaid[0]
    ? Math.floor((now.getTime() - new Date(unpaid[0].issuedOn + "T00:00:00").getTime()) / 86_400_000)
    : null

  const accrued = withRate
    .map(({ r, rate }) => {
      const hours = hoursByMonth(entries, r.id).get(thisMonth) ?? 0
      const billed = retainerInvoices.some(
        (i) => i.retainerId === r.id && i.issuedOn.slice(0, 7) === thisMonth
      )
      return { r, rate, hours, cents: rate && !billed ? Math.round(hours * rate) : 0 }
    })
    .filter((a) => a.hours > 0)
  const accruedCents = accrued.reduce((s, a) => s + a.cents, 0)
  const accruedHours = accrued.reduce((s, a) => s + a.hours, 0)

  const t12Start = ym(new Date(now.getFullYear() - 1, now.getMonth(), 1))
  const t12 = retainerInvoices.filter((i) => i.issuedOn.slice(0, 7) >= t12Start)
  const t12Cents = t12.reduce((s, i) => s + i.amountCents, 0)

  const gaps = billingGaps(active, entries, invoices, writeoffs, now)

  const siteByClient = new Map(sites.filter((s) => s.clientId).map((s) => [s.clientId, s.slug]))
  const expensesByClient = new Map<string, number>()
  for (const e of expenses) {
    if (e.clientId) expensesByClient.set(e.clientId, (expensesByClient.get(e.clientId) ?? 0) + e.amountCents)
  }

  /* last 12 month keys, oldest → newest */
  const monthKeys: string[] = []
  for (let i = 11; i >= 0; i--) monthKeys.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)))

  return (
    <>
      <PageHeader title="Retainers" />
      {searchParams.peek ? <PeekRouter peek={searchParams.peek} closeHref={ROUTES.retainers} /> : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Recurring base" value={`${formatMoney(baseCents)}/mo`} sub={`${active.length} active · ${capacity} hrs capacity`} />
        <Kpi
          label="Outstanding"
          value={formatMoney(outstandingCents)}
          sub={
            unpaid.length
              ? `${plural(unpaid.length, "invoice")} · oldest ${oldestDays} days`
              : "nothing unpaid"
          }
          tone={unpaid.length ? "bad" : undefined}
        />
        <Kpi
          label={`${now.toLocaleDateString("en-US", { month: "long" })} accrued`}
          value={formatMoney(accruedCents)}
          sub={accruedHours > 0 ? `${fmtHours(accruedHours)} hrs logged · unbilled` : "no hours logged yet"}
          tone={accruedCents > 0 ? "good" : undefined}
        />
        <Kpi label="Trailing 12 mo" value={formatMoney(t12Cents)} sub={`retainer billings · since ${monthLabel(t12Start)}`} />
      </div>

      {gaps.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-700/30 bg-amber-700/[0.07] px-5 py-3 text-sm text-tk-slate">
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-800">Billing gaps</span>
          {gaps.map((g) => (
            <span key={`${g.retainerId}${g.month}`} className="inline-flex items-center gap-2 tabular-nums">
              {monthLabel(g.month)} — {g.retainerName} · {fmtHours(g.hours)} hr logged, never invoiced
              {g.valueCents ? ` (${formatMoney(g.valueCents)})` : ""}
              <form action={writeOffGap.bind(null, g.retainerId, g.month)}>
                <button className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                  Write off
                </button>
              </form>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {active.map((r) => {
          const color = clientColor(r.client.slug)
          const rate = retainerRateCents(r, invoices)
          const byMonth = hoursByMonth(entries, r.id)
          const loggedNow = byMonth.get(thisMonth) ?? 0
          const usesTimesheet = loggedNow > 0

          const latestInv = retainerInvoices
            .filter((i) => i.retainerId === r.id && i.hours)
            .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))[0]

          const meterHours = usesTimesheet ? loggedNow : latestInv ? Number(latestInv.hours) : 0
          const meterLabel = usesTimesheet
            ? `${now.toLocaleDateString("en-US", { month: "long" })} · timesheet`
            : latestInv
              ? `${monthLabel(latestInv.issuedOn.slice(0, 7))} · invoiced`
              : "no activity yet"
          const pct = r.hoursPerMonth ? Math.min(100, (meterHours / r.hoursPerMonth) * 100) : 0

          const p = usesTimesheet ? pace(loggedNow, now) : null
          const over = p ? p.projected > r.hoursPerMonth : false

          const bars = monthKeys.map((k) =>
            retainerInvoices
              .filter((i) => i.retainerId === r.id && i.issuedOn.slice(0, 7) === k)
              .reduce((s, i) => s + i.amountCents, 0)
          )
          const accruedThis = usesTimesheet && rate && bars[11] === 0 ? Math.round(loggedNow * rate) : 0

          const rUnpaid = unpaid.filter((i) => i.retainerId === r.id)
          const rGaps = gaps.filter((g) => g.retainerId === r.id)
          const taskCount = openTasks.filter((t) => t.retainerId === r.id).length
          const left = monthsLeft(r.endsOn, now)
          const mappedExpense = expensesByClient.get(r.clientId) ?? 0
          const siteSlug = siteByClient.get(r.clientId)

          return (
            <Card className="flex flex-col gap-3 p-5 pb-4" key={r.id} style={{ borderLeftWidth: 3, borderLeftColor: markColor(color) }}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="size-2 self-center rounded-full" style={{ background: markColor(color) }} />
                <Link href={ROUTES.retainer(r.slug)} className="font-['Inter_Tight',sans-serif] text-base font-bold text-tk-onyx hover:text-tk-teal">
                  {r.name}
                </Link>
                {rate ? (
                  <span className="rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold tabular-nums text-tk-slate">
                    {r.rateCents ? formatMoney(rate) : `${formatMoney(rate)} eff.`}/hr
                  </span>
                ) : null}
                {r.endsOn ? (
                  <span className="rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-3">
                    ends {monthLabel(r.endsOn.slice(0, 7))}
                    {left != null ? ` · ${left} mo left` : ""}
                  </span>
                ) : null}
                <span className="ml-auto text-xs tabular-nums text-ink-3">{r.hoursPerMonth} hrs/mo</span>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wide text-ink-3">{meterLabel}</span>
                  <span className="font-semibold tabular-nums text-tk-slate">
                    {fmtHours(meterHours)} / {r.hoursPerMonth} hrs · {Math.round(pct)}%
                  </span>
                </div>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-well">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: markColor(color) }} />
                </span>
                {p ? (
                  <div className="mt-1 flex justify-between text-[11px] tabular-nums">
                    <span className="text-ink-3">day {p.day} of {p.days}</span>
                    <span className={over ? "font-semibold text-red-700" : "font-semibold text-emerald-800"}>
                      {over
                        ? `over cap — projected ${fmtHours(p.projected)} hr`
                        : `on pace · projected ${fmtHours(p.projected)} hr · ${fmtHours(r.hoursPerMonth - p.projected)} under cap`}
                    </span>
                  </div>
                ) : null}
              </div>

              <div>
                <MiniBars values={bars} accrued={accruedThis} label={`${r.name} monthly billings`} />
                <p className="mt-1 text-[11px] tabular-nums text-ink-3">
                  12 mo{accruedThis ? ` · ${formatMoney(accruedThis)} accrued (dashed = unbilled)` : ""}
                  {mappedExpense > 0
                    ? ` · YTD mapped expenses ${formatMoney(mappedExpense)}`
                    : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3 text-xs">
                {taskCount ? (
                  <span className="rounded-full bg-amber-700/10 px-2 py-0.5 font-semibold text-amber-800">
                    {plural(taskCount, "open task")}
                  </span>
                ) : null}
                {rUnpaid.map((i) => (
                  <Link
                    key={i.id}
                    href={`${ROUTES.retainers}?peek=invoice:${encodeURIComponent(i.number)}`}
                    scroll={false}
                    className="rounded-full bg-red-700/10 px-2 py-0.5 font-semibold tabular-nums text-red-700 hover:underline"
                  >
                    {i.number} unpaid · {formatMoney(i.amountCents)}
                  </Link>
                ))}
                {rGaps.map((g) => (
                  <span key={g.month} className="rounded-full bg-amber-700/10 px-2 py-0.5 font-semibold tabular-nums text-amber-800">
                    {monthLabel(g.month).split(" ")[0]} gap · {fmtHours(g.hours)} hr
                  </span>
                ))}
                <span className="ml-auto flex gap-1.5">
                  {siteSlug ? (
                    <Link href={`/insights/${siteSlug}`} className="rounded-full border border-line px-2.5 py-1 font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                      Insights
                    </Link>
                  ) : null}
                  <Link href={ROUTES.timesheetFor(r.client.slug, thisMonth)} className="rounded-full border border-line px-2.5 py-1 font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                    Timesheet
                  </Link>
                  <form action={draftRetainerInvoice.bind(null, r.id)}>
                    <button className="rounded-full bg-accent px-2.5 py-1 font-semibold text-tk-linen hover:bg-tk-teal/90">
                      Draft {now.toLocaleDateString("en-US", { month: "short" })} invoice
                    </button>
                  </form>
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      {retainers.length > active.length ? (
        <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-well">
          {retainers
            .filter((r) => r.status !== "active")
            .map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 border-b border-line px-5 py-3 text-sm last:border-0">
                <span className="size-2 rounded-full" style={{ background: markColor(clientColor(r.client.slug)) }} />
                <Link href={ROUTES.retainer(r.slug)} className="font-semibold text-tk-onyx hover:text-tk-teal">
                  {r.name}
                </Link>
                <span className="ml-auto rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold text-ink-3">
                  {r.status}
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: "good" | "bad"
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">{value}</p>
      <p className={`mt-0.5 truncate text-xs ${tone === "bad" ? "font-semibold text-red-700" : tone === "good" ? "font-semibold text-emerald-800" : "text-ink-3"}`}>
        {sub}
      </p>
    </Card>
  )
}
