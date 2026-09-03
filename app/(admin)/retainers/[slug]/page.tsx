import Link from "next/link"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { TaskBoardView } from "@/components/tasks/TaskBoardView"
import { TaskComposer } from "@/components/tasks/TaskComposer"
import { db } from "@/db"
import { clientColor } from "@/lib/client-colors"
import {
  fmtHours,
  hoursByMonth,
  monthLabel,
  monthsLeft,
  pace,
  retainerRateCents,
  ym,
} from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import { taskTargets, tasksFor } from "@/lib/tasks"
import { formatDay, formatMoney } from "@/lib/work"
import { draftRetainerInvoice } from "../actions"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: `Retainer · ${params.slug}` }
}

export default async function RetainerDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { peek?: string }
}) {
  const [retainers, invoices, entries] = await Promise.all([
    db.query.retainers.findMany({ with: { client: true } }),
    db.query.invoices.findMany(),
    db.query.timeEntries.findMany(),
  ])
  const retainer = retainers.find((r) => r.slug === params.slug)
  if (!retainer) notFound()

  const now = new Date()
  const thisMonth = ym(now)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const color = clientColor(retainer.client.slug)
  const rate = retainerRateCents(retainer, invoices)

  const [retainerTasks, targets] = await Promise.all([
    tasksFor({ retainerId: retainer.id }),
    taskTargets(),
  ])
  const boardTasks = retainerTasks.filter(
    (t) => t.status === "open" || (t.completedAt ?? "") >= monthStart.toISOString()
  )

  const byMonth = hoursByMonth(entries, retainer.id)
  const loggedNow = byMonth.get(thisMonth) ?? 0
  const p = loggedNow > 0 ? pace(loggedNow, now) : null
  const over = p ? p.projected > retainer.hoursPerMonth : false
  const accruedCents = rate ? Math.round(loggedNow * rate) : null

  const mine = invoices
    .filter((i) => i.retainerId === retainer.id)
    .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))
  const t12Cents = mine
    .filter((i) => i.issuedOn.slice(0, 7) >= ym(new Date(now.getFullYear() - 1, now.getMonth(), 1)))
    .reduce((s, i) => s + i.amountCents, 0)

  /* month ledger: union of invoice months + logged months, newest first */
  const ledgerKeys = Array.from(
    new Set([...mine.map((i) => i.issuedOn.slice(0, 7)), ...Array.from(byMonth.keys())])
  )
    .sort()
    .reverse()
    .slice(0, 14)

  const recent = entries
    .filter((e) => e.retainerId === retainer.id)
    .sort((a, b) => (a.occurredOn > b.occurredOn ? -1 : 1))
    .slice(0, 5)
  const entriesThisMonth = entries.filter(
    (e) => e.retainerId === retainer.id && e.occurredOn.slice(0, 7) === thisMonth
  ).length

  /* hours-vs-cap chart: last 6 months of logged hours */
  const chartKeys: string[] = []
  for (let i = 5; i >= 0; i--) chartKeys.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  const chartMax = Math.max(retainer.hoursPerMonth, ...chartKeys.map((k) => byMonth.get(k) ?? 0)) * 1.1

  const left = monthsLeft(retainer.endsOn, now)

  return (
    <>
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.retainer(retainer.slug)} />
      ) : null}
      <Link href={ROUTES.retainers} className="text-sm font-semibold text-tk-teal hover:underline">
        ← Retainers
      </Link>
      <div className="mt-3">
        <PageHeader title={retainer.name} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {retainers
          .filter((r) => r.status === "active" || r.id === retainer.id)
          .map((r) => {
            const on = r.id === retainer.id
            return (
              <Link
                key={r.id}
                href={ROUTES.retainer(r.slug)}
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? "flex items-center gap-2 rounded-xl border border-tk-teal bg-tk-teal px-3.5 py-2 text-sm font-semibold text-tk-linen"
                    : "flex items-center gap-2 rounded-xl border border-tk-slate/20 bg-white px-3.5 py-2 text-sm font-semibold text-tk-onyx hover:border-tk-teal"
                }
              >
                <span
                  className="h-2 w-2 rounded-[3px]"
                  style={{ background: on ? "#F1EADC" : clientColor(r.client.slug) }}
                />
                {r.name}
              </Link>
            )
          })}
      </div>

      <div className="mt-5">
        <TaskComposer
          targets={targets}
          scope={{
            clientId: retainer.clientId,
            clientName: retainer.client.name,
            clientSlug: retainer.client.slug,
          }}
          placeholder={`Add a task for ${retainer.client.name}…`}
          compact
        />
      </div>

      <TaskBoardView
        tasks={boardTasks}
        peekBase={ROUTES.retainer(retainer.slug)}
        showClient={false}
        doneLabel={`Done · ${now.toLocaleDateString("en-US", { month: "short" })}`}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tk-slate/60">
            {now.toLocaleDateString("en-US", { month: "long" })} logged
          </p>
          <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">
            {fmtHours(loggedNow)} <span className="text-sm text-tk-slate/60">/ {retainer.hoursPerMonth} hrs</span>
          </p>
          {p ? (
            <p className={`mt-0.5 text-xs font-semibold tabular-nums ${over ? "text-red-700" : "text-emerald-800"}`}>
              {over ? "▲ over cap" : "▲ on pace"}{" "}
              <span className="font-normal text-tk-slate/60">
                projected {fmtHours(p.projected)} by {monthLabel(thisMonth).split(" ")[0]} {p.days}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-tk-slate/60">no timesheet entries this month</p>
          )}
        </div>
        <Stat
          label="Accrued value"
          value={accruedCents != null ? formatMoney(accruedCents) : "—"}
          sub={loggedNow > 0 ? `unbilled · ${entriesThisMonth} entries` : "logs × rate, once entries land"}
        />
        <Stat
          label="Rate"
          value={rate ? `${formatMoney(rate)}/hr` : "—"}
          sub={retainer.rateCents ? "contract rate" : "effective, from last invoice"}
        />
        <Stat
          label={retainer.endsOn ? "Window" : "Trailing 12 mo"}
          value={
            retainer.endsOn
              ? `${monthLabel((retainer.startsOn ?? retainer.endsOn).slice(0, 7)).split(" ")[0]} – ${monthLabel(retainer.endsOn.slice(0, 7))}`
              : formatMoney(t12Cents)
          }
          sub={retainer.endsOn ? `${left} mo left · ${retainer.status}` : "billed on this retainer"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Hours vs capacity</h2>
              <span className="text-[11px] tabular-nums text-tk-slate/60">timesheet · cap {retainer.hoursPerMonth} hrs</span>
            </div>
            <div className="px-4 pb-3 pt-1">
              <svg width="100%" height="150" viewBox="0 0 560 150" role="img" aria-label="Monthly logged hours against capacity">
                <line x1="36" y1="128" x2="552" y2="128" stroke="rgba(15,22,21,.09)" />
                {(() => {
                  const capY = 128 - (retainer.hoursPerMonth / chartMax) * 108
                  return (
                    <>
                      <line x1="36" y1={capY} x2="552" y2={capY} stroke="#B07818" strokeWidth="1.5" strokeDasharray="5 4" />
                      <text x="548" y={capY - 5} textAnchor="end" fontSize="10" fontWeight="600" fill="#B07818">
                        cap {retainer.hoursPerMonth}
                      </text>
                    </>
                  )
                })()}
                {chartKeys.map((k, i) => {
                  const v = byMonth.get(k) ?? 0
                  const bw = 44
                  const x = 60 + i * 84
                  const bh = Math.max(v > 0 ? 3 : 1.5, (v / chartMax) * 108)
                  const isNow = k === thisMonth
                  const projH = isNow && p ? Math.max(bh, (Math.min(p.projected, chartMax) / chartMax) * 108) : null
                  return (
                    <g key={k}>
                      {projH != null && projH > bh ? (
                        <rect x={x} y={128 - projH} width={bw} height={projH - bh} rx="2" fill="none" stroke="#009688" strokeWidth="1.3" strokeDasharray="3 2.5" />
                      ) : null}
                      <rect x={x} y={128 - bh} width={bw} height={bh} rx="3" fill={v > 0 ? "#009688" : "rgba(15,22,21,.12)"} />
                      <text x={x + bw / 2} y="144" textAnchor="middle" fontSize="10.5" fontWeight={isNow ? 700 : 400} fill={isNow ? "#0F1615" : "#6C7975"}>
                        {monthLabel(k).split(" ")[0]} · {fmtHours(v)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Month ledger</h2>
              <span className="text-[11px] text-tk-slate/60">logged → invoiced, one row per month</span>
            </div>
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-tk-slate/60">
                  <th className="border-b border-tk-slate/10 px-5 py-2">Month</th>
                  <th className="border-b border-tk-slate/10 px-2 py-2 text-right">Logged</th>
                  <th className="border-b border-tk-slate/10 px-2 py-2">Invoice</th>
                  <th className="border-b border-tk-slate/10 px-2 py-2 text-right">Amount</th>
                  <th className="border-b border-tk-slate/10 px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {ledgerKeys.map((k) => {
                  const logged = byMonth.get(k) ?? 0
                  const inv = mine.find((i) => i.issuedOn.slice(0, 7) === k)
                  const isNow = k === thisMonth
                  const gap = !inv && !isNow && logged > 0
                  return (
                    <tr key={k} className="border-b border-tk-slate/[0.06] last:border-0">
                      <td className="px-5 py-2 font-semibold text-tk-onyx">{monthLabel(k)}</td>
                      <td className="px-2 py-2 text-right text-tk-slate">{logged ? fmtHours(logged) : "—"}</td>
                      <td className="px-2 py-2 text-tk-slate">
                        {inv ? (
                          <Link
                            href={`${ROUTES.retainer(retainer.slug)}?peek=invoice:${encodeURIComponent(inv.number)}`}
                            scroll={false}
                            className="font-medium text-tk-teal hover:underline"
                          >
                            {inv.number}
                            {inv.hours ? ` · ${fmtHours(Number(inv.hours))} hr` : ""}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-tk-slate">
                        {inv
                          ? formatMoney(inv.amountCents)
                          : logged && rate
                            ? `${formatMoney(Math.round(logged * rate))}${isNow ? " accrued" : ""}`
                            : "—"}
                      </td>
                      <td className="px-5 py-2">
                        {inv ? (
                          <Pill tone={inv.status === "paid" ? "mut" : inv.status === "sent" ? "bad" : "warn"}>
                            {inv.status}
                          </Pill>
                        ) : isNow ? (
                          <Pill tone="warn">draft ready</Pill>
                        ) : gap ? (
                          <Pill tone="warn">gap · unbilled</Pill>
                        ) : (
                          <Pill tone="mut">not billed</Pill>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          {mine.some((i) => i.description) ? (
            <section className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
              <div className="flex items-center justify-between px-5 pb-1 pt-4">
                <h2 className="text-[13px] font-bold text-tk-onyx">Month in review</h2>
                <span className="text-[11px] text-tk-slate/60">from invoice journals — zero extra data entry</span>
              </div>
              <ul className="px-5 pb-4 pt-1">
                {mine
                  .filter((i) => i.description)
                  .slice(0, 6)
                  .map((i, idx, arr) => (
                    <li key={i.id} className="relative grid grid-cols-[92px_14px_1fr] gap-3 py-2.5">
                      {idx < arr.length - 1 ? (
                        <span className="absolute bottom-[-6px] left-[104px] top-7 w-0.5 bg-tk-slate/[0.07]" aria-hidden />
                      ) : null}
                      <span className="text-xs font-bold tabular-nums text-tk-onyx">
                        {monthLabel(i.issuedOn.slice(0, 7))}
                        <span className="block font-medium text-tk-slate/60">
                          {i.hours ? `${fmtHours(Number(i.hours))} hr · ` : ""}
                          {formatMoney(i.amountCents)}
                        </span>
                      </span>
                      <span className="mt-1 size-2.5 rounded-full border-2 border-white shadow-[0_0_0_1.5px_#009688]" style={{ background: "#009688" }} />
                      <span className="text-[13px] leading-relaxed text-tk-slate">{i.description}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Recent time entries</h2>
              <span className="text-[11px] tabular-nums text-tk-slate/60">{entriesThisMonth} this month</span>
            </div>
            {recent.length === 0 ? (
              <p className="px-5 pb-4 pt-1 text-sm text-tk-slate/60">
                Nothing logged yet — entries stream in from the timesheet.
              </p>
            ) : (
              <ul className="px-1 pb-2">
                {recent.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 border-b border-tk-slate/[0.06] px-4 py-2.5 text-[13px] last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold tabular-nums text-tk-onyx">{formatDay(e.occurredOn)}</span>
                      {e.summary ? <span className="block truncate text-xs text-tk-slate/60">{e.summary}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-tk-slate">
                      {fmtHours(Number(e.hours))} hr
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
            <h2 className="text-[13px] font-bold text-tk-onyx">Actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={draftRetainerInvoice.bind(null, retainer.id)}>
                <button className="rounded-full bg-tk-teal px-3.5 py-1.5 text-xs font-semibold text-tk-linen hover:bg-tk-teal/90">
                  Draft {now.toLocaleDateString("en-US", { month: "long" })} invoice
                </button>
              </form>
              <Link href={ROUTES.timesheetFor(retainer.client.slug, thisMonth)} className="rounded-full border border-tk-slate/20 px-3.5 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                Open timesheet
              </Link>
              <Link href={ROUTES.client(retainer.client.slug)} className="rounded-full border border-tk-slate/20 px-3.5 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                Client
              </Link>
            </div>
          </section>

          {retainer.notes ? (
            <section className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
              <h2 className="text-[13px] font-bold text-tk-onyx">Notes</h2>
              <p className="mt-2 text-sm leading-relaxed text-tk-slate">{retainer.notes}</p>
            </section>
          ) : null}
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-tk-slate/60">{label}</p>
      <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs text-tk-slate/60">{sub}</p>
    </div>
  )
}

function Pill({ tone, children }: { tone: "mut" | "bad" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "bad"
      ? "bg-red-700/10 text-red-700"
      : tone === "warn"
        ? "bg-amber-700/10 text-amber-800"
        : "bg-tk-slate/10 text-tk-slate/70"
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>
}
