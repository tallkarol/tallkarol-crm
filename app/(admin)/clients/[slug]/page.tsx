import Link from "next/link"
import { notFound } from "next/navigation"
import { ActivityFeed } from "@/components/clients/ActivityFeed"
import { AnchorNav } from "@/components/clients/AnchorNav"
import { BurnHistory } from "@/components/clients/BurnHistory"
import { ClientAvatar } from "@/components/clients/ClientAvatar"
import { HoursMeter } from "@/components/clients/HoursMeter"
import { LocalTime } from "@/components/clients/LocalTime"
import { MeetingList } from "@/components/clients/MeetingList"
import { NotesCard } from "@/components/clients/NotesCard"
import { ClientStatusMenu } from "@/components/clients/ClientStatusMenu"
import { StatusPill } from "@/components/clients/StatusPill"
import type { PillTone } from "@/components/clients/StatusPill"
import { TicketList } from "@/components/clients/TicketList"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { TaskBoardView } from "@/components/tasks/TaskBoardView"
import { TaskComposer } from "@/components/tasks/TaskComposer"
import { db } from "@/db"
import type { ProjectStatus } from "@/db/schema"
import { loadClientHub, UNPAID_INVOICE_FLAG_DAYS } from "@/lib/client-hub"
import { cn } from "@/lib/cn"
import { retainerRateCents } from "@/lib/engagements"
import {
  adsRates,
  deriveWindow,
  fmtConv,
  fmtCustomerId,
  fmtInt,
  fmtMoney,
} from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"
import { ROUTES } from "@/lib/nav"
import { tasksFor, taskTargets } from "@/lib/tasks"
import { currentMonth } from "@/lib/timesheet"
import {
  CADENCE_LABEL,
  CONTRACT_STATUS_LABEL,
  FEE_STATUS_LABEL,
  formatDay,
  formatHours,
  formatMoney,
  PRODUCT_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  PROPOSAL_STATUS_LABEL,
  RETAINER_STATUS_LABEL,
  WORKSHEET_MODE_LABEL,
  WORKSHEET_STATUS_LABEL,
} from "@/lib/work"

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const row = await db.query.clients.findFirst({
    where: (clients, { eq }) => eq(clients.slug, params.slug),
    columns: { name: true },
  })
  return { title: row?.name ?? params.slug }
}

const PROJECT_TONE: Record<ProjectStatus, PillTone> = {
  not_started: "muted",
  in_progress: "teal",
  waiting_on_content: "warn",
  on_hold: "warn",
  complete: "muted",
}

function fmtH(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")
}

function daysSince(iso: string, now: Date) {
  const [y, m, d] = iso.split("-").map(Number)
  return Math.max(0, Math.floor((now.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000))
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { peek?: string }
}) {
  const now = new Date()
  const hub = await loadClientHub(params.slug, now)
  if (!hub) notFound()

  const { client } = hub
  const adsSites = hub.sites.filter((site) => Boolean(site.adsCustomerId))
  const [clientTasks, targets, brainstorm, adsViews] = await Promise.all([
    tasksFor({ clientId: client.id }),
    taskTargets(),
    db.query.brainstormNotes.findMany({
      where: (notes, { eq }) => eq(notes.clientId, client.id),
      orderBy: (notes, { desc }) => [desc(notes.createdAt)],
    }),
    Promise.all(
      adsSites.map(async (site) => {
        const ctx = await getInsightsContext(site.slug)
        return { site, snapshot: ctx?.snapshot ?? null }
      })
    ),
  ])
  const openTasks = clientTasks.filter((t) => t.status === "open")
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const overdueTasks = openTasks.filter((t) => t.dueOn && t.dueOn < today).length

  const activeProjects = client.projects.filter((p) => p.status !== "complete")
  // Finished work is worth keeping — the tracker carries months of it — but it
  // belongs behind a fold, not on top of what is still open.
  const closedProjects = client.projects
    .filter((p) => p.status === "complete")
    .sort(
      (a, b) =>
        (b.completedAt ?? b.updatedAt).valueOf() - (a.completedAt ?? a.updatedAt).valueOf()
    )
  const waitingTicket = hub.openTickets.reduce<(typeof hub.openTickets)[number] | null>(
    (worst, t) =>
      t.waitingOnYouDays != null &&
      (worst?.waitingOnYouDays == null || t.waitingOnYouDays > worst.waitingOnYouDays)
        ? t
        : worst,
    null
  )
  const nextMeeting = hub.upcoming[0] ?? null

  const recentInvoices = [...client.invoices]
    .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))
    .slice(0, 8)
  const sortedContracts = [...client.contracts].sort((a, b) =>
    (b.effectiveOn ?? "") > (a.effectiveOn ?? "") ? 1 : -1
  )
  const sortedReports = [...client.reports].sort((a, b) =>
    a.status === b.status ? 0 : a.status === "due" ? -1 : 1
  )
  const sortedProposals = [...client.proposals].sort((a, b) => {
    if (a.series !== b.series) return a.series.localeCompare(b.series)
    return (a.seriesPart ?? 99) - (b.seriesPart ?? 99)
  })
  // Open answers first — a worksheet is chased for what it still does not say.
  const sortedWorksheets = [...client.worksheets].sort(
    (a, b) => b.openCount - a.openCount
  )

  const hasWork =
    client.retainers.length > 0 || client.projects.length > 0 || client.products.length > 0
  const hasMoney = client.invoices.length > 0 || client.contracts.length > 0

  const navItems = [
    { id: "now", label: "Now" },
    hasWork ? { id: "work", label: "Work" } : null,
    hasMoney ? { id: "money", label: "Money" } : null,
    { id: "meetings", label: "Meetings" },
    hub.openTickets.length > 0 || hub.closedTicketCount > 0
      ? { id: "tickets", label: "Tickets" }
      : null,
    sortedReports.length > 0 ? { id: "reports", label: "Reports" } : null,
    sortedProposals.length > 0 ? { id: "proposals", label: "Proposals" } : null,
    adsViews.length > 0 ? { id: "ads", label: "Paid Ads" } : null,
    brainstorm.length > 0 ? { id: "brainstorm", label: "Brainstorm" } : null,
    sortedWorksheets.length > 0
      ? { id: "worksheets", label: "Worksheets" }
      : null,
  ].filter((item): item is { id: string; label: string } => item != null)

  return (
    <>
      <Link
        href={ROUTES.clients}
        className="text-sm font-semibold text-tk-teal hover:underline"
      >
        ← Clients
      </Link>

      {searchParams.peek ? (
        <PeekRouter
          peek={searchParams.peek}
          closeHref={ROUTES.client(client.slug)}
        />
      ) : null}

      {/* ---------------------------------------------------------- header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <ClientAvatar name={client.name} slug={client.slug} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-tk-onyx">
              {client.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ClientStatusMenu clientId={client.id} status={client.status} />
              {activeProjects.length > 0 ? (
                <StatusPill tone="neutral" dot={false}>
                  {activeProjects.length} active project
                  {activeProjects.length === 1 ? "" : "s"}
                </StatusPill>
              ) : null}
              {client.products.length > 0 ? (
                <StatusPill tone="neutral" dot={false}>
                  {client.products.length} product
                  {client.products.length === 1 ? "" : "s"}
                </StatusPill>
              ) : null}
              {client.domains.map((domain) => (
                <span key={domain} className="font-mono text-xs text-tk-slate/50">
                  @{domain}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={ROUTES.timesheetFor(client.slug, currentMonth(now))}
            className="rounded-lg bg-tk-teal px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-tk-teal/90"
          >
            Timesheet
          </Link>
          {hub.sites.length > 0 ? (
            <Link
              href={`${ROUTES.insights}/${hub.sites[0].slug}`}
              className="rounded-lg border border-tk-slate/20 bg-white px-3.5 py-1.5 text-sm font-semibold text-tk-onyx hover:border-tk-teal hover:text-tk-teal"
            >
              Insights
            </Link>
          ) : null}
          {adsViews[0] ? (
            <Link
              href={`${ROUTES.paidAds}/${adsViews[0].site.slug}`}
              className="rounded-lg border border-tk-slate/20 bg-white px-3.5 py-1.5 text-sm font-semibold text-tk-onyx hover:border-tk-teal hover:text-tk-teal"
            >
              Paid Ads
            </Link>
          ) : null}
          <Link
            href={ROUTES.invoices}
            className="rounded-lg border border-tk-slate/20 bg-white px-3.5 py-1.5 text-sm font-semibold text-tk-onyx hover:border-tk-teal hover:text-tk-teal"
          >
            New invoice
          </Link>
        </div>
      </div>

      <AnchorNav items={navItems} />

      {/* -------------------------------------------------------- KPI band */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label={`Retainer · ${monthName(hub.month)}`}>
          {hub.monthCap > 0 ? (
            <>
              <p className="text-xl font-bold tabular-nums text-tk-onyx">
                {fmtH(hub.monthHours)}
                <span className="text-[13px] font-semibold text-tk-slate/50">
                  {" "}
                  / {hub.monthCap} hr
                </span>
              </p>
              <HoursMeter logged={hub.monthHours} cap={hub.monthCap} className="mt-2" />
            </>
          ) : (
            <>
              <p className="text-xl font-bold tabular-nums text-tk-onyx">
                {fmtH(hub.monthHours)} hr
              </p>
              <p className="mt-0.5 text-xs text-tk-slate/60">logged · no retainer cap</p>
            </>
          )}
        </Kpi>
        <Kpi label="Outstanding">
          <p
            className={cn(
              "text-xl font-bold tabular-nums",
              hub.outstandingCents > 0 ? "text-tk-onyx" : "text-tk-slate/40"
            )}
          >
            {formatMoney(hub.outstandingCents)}
          </p>
          {hub.outstandingNote ? (
            <p className="mt-0.5 text-xs font-semibold text-[#A32C1E]">
              {hub.outstandingNote}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-tk-slate/60">nothing unpaid</p>
          )}
        </Kpi>
        <Kpi label="Open tasks">
          <p className="text-xl font-bold tabular-nums text-tk-onyx">{openTasks.length}</p>
          {overdueTasks > 0 ? (
            <p className="mt-0.5 text-xs font-semibold text-[#A32C1E]">
              {overdueTasks} overdue
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-tk-slate/60">nothing overdue</p>
          )}
        </Kpi>
        <Kpi label="Next meeting">
          {nextMeeting ? (
            <>
              <p className="text-xl font-bold text-tk-onyx">
                <LocalTime iso={nextMeeting.startsAt} />
              </p>
              <p className="mt-0.5 truncate text-xs text-tk-slate/60">
                {nextMeeting.title}
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-tk-slate/40">—</p>
              <p className="mt-0.5 text-xs text-tk-slate/60">nothing scheduled</p>
            </>
          )}
        </Kpi>
        <Kpi label="Tickets">
          <p className="text-xl font-bold tabular-nums text-tk-onyx">
            {hub.openTickets.length}
          </p>
          {waitingTicket ? (
            <p className="mt-0.5 text-xs font-semibold text-[#8A5A05]">
              waiting on you {waitingTicket.waitingOnYouDays}d
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-tk-slate/60">
              {hub.openTickets.length > 0 ? "none waiting on you" : "all quiet"}
            </p>
          )}
        </Kpi>
      </div>

      {/* ------------------------------------------------------- two column */}
      <div className="mt-7 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0">
          {/* ------------------------------------------------------- now */}
          <Block id="now" title="Now" action={<Link href={ROUTES.tasks} className="text-xs font-semibold text-tk-teal hover:underline">All tasks →</Link>}>
            <div className="mb-3">
              <TaskComposer
                targets={targets}
                scope={{
                  clientId: client.id,
                  clientName: client.name,
                  clientSlug: client.slug,
                }}
                placeholder={`Add a task for ${client.name}…`}
                compact
              />
            </div>
            {clientTasks.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-tk-slate/20 bg-white/70 px-6 py-8 text-center text-sm text-tk-slate/60">
                Nothing open. Anything typed above lands on {client.name}.
              </p>
            ) : (
              <TaskBoardView
                tasks={clientTasks}
                peekBase={ROUTES.client(client.slug)}
                showClient={false}
              />
            )}
          </Block>

          {/* ------------------------------------------------------ work */}
          {hasWork ? (
            <Block id="work" title="Work">
              <div className="space-y-3">
                {hub.burns.map(({ retainer, monthHours, history }) => {
                  const rate = retainerRateCents(retainer, client.invoices)
                  return (
                    <Card key={retainer.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link
                            href={ROUTES.retainer(retainer.slug)}
                            className="text-[14.5px] font-bold text-tk-onyx hover:text-tk-teal"
                          >
                            {retainer.name}
                          </Link>
                          <p className="mt-0.5 text-xs text-tk-slate/70">
                            <span className="tabular-nums">{retainer.hoursPerMonth}</span>{" "}
                            hr/mo
                            {rate ? (
                              <>
                                {" "}
                                · <span className="tabular-nums">
                                  {formatMoney(rate)}
                                </span>
                                /hr
                              </>
                            ) : null}
                            {retainer.startsOn
                              ? ` · since ${formatDay(retainer.startsOn)}`
                              : null}
                          </p>
                        </div>
                        <StatusPill
                          tone={retainer.status === "active" ? "good" : "muted"}
                        >
                          {RETAINER_STATUS_LABEL[retainer.status]}
                        </StatusPill>
                      </div>
                      {retainer.status === "active" ? (
                        <div className="mt-4 flex flex-wrap items-end gap-6">
                          <div className="min-w-[200px] flex-1">
                            <div className="mb-1.5 flex justify-between text-xs text-tk-slate/70">
                              <span>{monthName(hub.month)}</span>
                              <span className="tabular-nums">
                                {fmtH(monthHours)} / {retainer.hoursPerMonth} hr
                              </span>
                            </div>
                            <HoursMeter
                              logged={monthHours}
                              cap={retainer.hoursPerMonth}
                              className="h-2"
                            />
                          </div>
                          <BurnHistory
                            history={history}
                            cap={retainer.hoursPerMonth}
                            currentMonth={hub.month}
                          />
                        </div>
                      ) : null}
                    </Card>
                  )
                })}

                {activeProjects.map((project) => {
                  const fee = project.deliverables.reduce(
                    (sum, d) => sum + (d.feeCents ?? 0),
                    0
                  )
                  const done = project.deliverables.filter(
                    (d) => d.status !== "pending"
                  ).length
                  return (
                    <Card key={project.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link
                            href={ROUTES.project(project.slug)}
                            className="text-[14.5px] font-bold text-tk-onyx hover:text-tk-teal"
                          >
                            {project.name}
                          </Link>
                          <p className="mt-0.5 text-xs text-tk-slate/70">
                            {fee > 0 ? (
                              <>
                                Fee{" "}
                                <span className="tabular-nums">{formatMoney(fee)}</span>
                                {" · "}
                              </>
                            ) : null}
                            {FEE_STATUS_LABEL[project.feeStatus]}
                            {project.deliverables.length > 0
                              ? ` · ${done}/${project.deliverables.length} deliverables done`
                              : null}
                          </p>
                        </div>
                        <StatusPill tone={PROJECT_TONE[project.status]}>
                          {PROJECT_STATUS_LABEL[project.status]}
                        </StatusPill>
                      </div>
                      {project.deliverables.length > 0 ? (
                        <ul className="mt-3 space-y-1.5">
                          {[...project.deliverables]
                            .sort((a, b) => a.sort - b.sort)
                            .map((d) => {
                              const finished = d.status !== "pending"
                              return (
                                <li
                                  key={d.id}
                                  className="flex items-center gap-2.5 text-[13px]"
                                >
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                                      finished
                                        ? "border-tk-teal bg-tk-teal text-white"
                                        : "border-tk-slate/25 bg-white"
                                    )}
                                  >
                                    {finished ? (
                                      <svg
                                        width="8"
                                        height="8"
                                        viewBox="0 0 8 8"
                                        fill="none"
                                      >
                                        <path
                                          d="M1.5 4.2 3.2 6 6.5 2"
                                          stroke="currentColor"
                                          strokeWidth="1.6"
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                    ) : null}
                                  </span>
                                  <span
                                    className={cn(
                                      finished
                                        ? "text-tk-slate/45 line-through decoration-tk-slate/30"
                                        : "text-tk-onyx"
                                    )}
                                  >
                                    {d.label}
                                    {d.title ? ` — ${d.title}` : ""}
                                  </span>
                                  {!finished && d.dueOn ? (
                                    <span
                                      className={cn(
                                        "text-[11px] font-semibold",
                                        d.dueOn < today
                                          ? "text-[#A32C1E]"
                                          : "text-tk-slate/50"
                                      )}
                                    >
                                      due {formatDay(d.dueOn)}
                                    </span>
                                  ) : null}
                                </li>
                              )
                            })}
                        </ul>
                      ) : null}
                    </Card>
                  )
                })}

                {closedProjects.length > 0 ? (
                  <Card>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-tk-slate/70 hover:text-tk-onyx">
                        <span>
                          {closedProjects.length} completed project
                          {closedProjects.length === 1 ? "" : "s"}
                        </span>
                        <span aria-hidden="true" className="text-tk-slate/40 group-open:hidden">
                          Show
                        </span>
                        <span
                          aria-hidden="true"
                          className="hidden text-tk-slate/40 group-open:inline"
                        >
                          Hide
                        </span>
                      </summary>
                      <ul className="mt-3 space-y-1.5 border-t border-tk-slate/10 pt-3">
                        {closedProjects.map((project) => (
                          <li
                            key={project.id}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]"
                          >
                            <Link
                              href={ROUTES.project(project.slug)}
                              className="text-tk-slate hover:text-tk-teal"
                            >
                              {project.name}
                            </Link>
                            {project.completedAt ? (
                              <span className="text-[11px] tabular-nums text-tk-slate/45">
                                {formatDay(project.completedAt.toISOString().slice(0, 10))}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </Card>
                ) : null}

                {client.products.map((product) => (
                  <Card key={product.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          href={ROUTES.productPage(product.slug)}
                          className="text-[14.5px] font-bold text-tk-onyx hover:text-tk-teal"
                        >
                          {product.name}
                        </Link>
                        {product.tagline ? (
                          <p className="mt-0.5 text-xs text-tk-slate/70">
                            {product.tagline}
                          </p>
                        ) : null}
                      </div>
                      <StatusPill
                        tone={
                          product.status === "live"
                            ? "good"
                            : product.status === "building"
                              ? "teal"
                              : "muted"
                        }
                      >
                        {PRODUCT_STATUS_LABEL[product.status]}
                      </StatusPill>
                    </div>
                  </Card>
                ))}
              </div>
            </Block>
          ) : null}

          {/* ----------------------------------------------------- money */}
          {hasMoney ? (
            <Block
              id="money"
              title="Money"
              action={
                <Link
                  href={ROUTES.invoices}
                  className="text-xs font-semibold text-tk-teal hover:underline"
                >
                  All invoices →
                </Link>
              }
            >
              <div className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
                <div className="flex flex-wrap gap-8 border-b border-tk-slate/10 px-5 py-4">
                  <Stat
                    label="Outstanding"
                    value={formatMoney(hub.outstandingCents)}
                    tone={hub.outstandingCents > 0 ? "crit" : undefined}
                  />
                  <Stat label="Billed YTD" value={formatMoney(hub.billedYtdCents)} />
                  <Stat
                    label="Avg / month"
                    value={formatMoney(
                      Math.round(hub.billedYtdCents / (now.getMonth() + 1))
                    )}
                  />
                </div>
                {recentInvoices.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[540px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-tk-slate/10 text-[10.5px] font-bold uppercase tracking-[0.1em] text-tk-slate/50">
                          <th className="px-5 py-2.5 font-bold">Invoice</th>
                          <th className="px-3 py-2.5 font-bold">Issued</th>
                          <th className="px-3 py-2.5 font-bold">For</th>
                          <th className="px-3 py-2.5 text-right font-bold">Hours</th>
                          <th className="px-3 py-2.5 text-right font-bold">Amount</th>
                          <th className="px-5 py-2.5 font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentInvoices.map((invoice) => {
                          const age = daysSince(invoice.issuedOn, now)
                          return (
                            <tr
                              key={invoice.id}
                              className="border-b border-tk-slate/10 text-[13.5px] last:border-0 hover:bg-tk-linen/40"
                            >
                              <td className="px-5 py-2.5">
                                <Link
                                  href={ROUTES.invoice(invoice.number)}
                                  className="font-semibold tabular-nums text-tk-onyx hover:text-tk-teal"
                                >
                                  {invoice.number}
                                </Link>
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-tk-slate/70">
                                {formatDay(invoice.issuedOn)}
                              </td>
                              <td className="max-w-[220px] truncate px-3 py-2.5 text-tk-slate/70">
                                {invoice.description || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-tk-slate/70">
                                {invoice.hours ? formatHours(invoice.hours) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-tk-onyx">
                                {formatMoney(invoice.amountCents, invoice.currency)}
                              </td>
                              <td className="px-5 py-2.5">
                                {invoice.status === "paid" ? (
                                  <StatusPill tone="good">Paid</StatusPill>
                                ) : invoice.status === "sent" ? (
                                  <StatusPill
                                    tone={
                                      age >= UNPAID_INVOICE_FLAG_DAYS ? "crit" : "teal"
                                    }
                                  >
                                    Unpaid · {age}d
                                  </StatusPill>
                                ) : (
                                  <StatusPill tone="muted">Draft</StatusPill>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              {sortedContracts.length > 0 ? (
                <div className="mt-3 divide-y divide-tk-slate/10 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
                  {sortedContracts.map((contract) => (
                    <Link
                      key={contract.id}
                      href={ROUTES.contract(contract.slug)}
                      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-tk-linen/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-tk-onyx">
                          {contract.title}
                        </p>
                        <p className="mt-0.5 text-xs text-tk-slate/60">
                          {[
                            contract.effectiveOn
                              ? `Effective ${formatDay(contract.effectiveOn)}`
                              : null,
                            contract.feeCents
                              ? formatMoney(contract.feeCents)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No effective date"}
                        </p>
                      </div>
                      <StatusPill
                        tone={
                          contract.status === "signed"
                            ? "good"
                            : contract.status === "sent"
                              ? "warn"
                              : "muted"
                        }
                      >
                        {CONTRACT_STATUS_LABEL[contract.status]}
                      </StatusPill>
                    </Link>
                  ))}
                </div>
              ) : null}
            </Block>
          ) : null}

          {/* -------------------------------------------------- meetings */}
          <Block
            id="meetings"
            title="Meetings"
            action={
              <Link
                href={ROUTES.calendar}
                className="text-xs font-semibold text-tk-teal hover:underline"
              >
                Calendar →
              </Link>
            }
          >
            <div className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
              <MeetingList upcoming={hub.upcoming} recent={hub.recentMeetings} />
            </div>
          </Block>

          {/* --------------------------------------------------- tickets */}
          {hub.openTickets.length > 0 || hub.closedTicketCount > 0 ? (
            <Block
              id="tickets"
              title="Tickets"
              action={
                <Link
                  href={ROUTES.support}
                  className="text-xs font-semibold text-tk-teal hover:underline"
                >
                  {hub.closedTicketCount > 0
                    ? `${hub.closedTicketCount} resolved →`
                    : "Support →"}
                </Link>
              }
            >
              <div className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
                <TicketList tickets={hub.openTickets} />
              </div>
            </Block>
          ) : null}

          {/* --------------------------------------------------- reports */}
          {sortedReports.length > 0 ? (
            <Block id="reports" title="Reports">
              <div className="divide-y divide-tk-slate/10 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
                {sortedReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-tk-onyx">
                        {report.title}
                      </p>
                      <p className="mt-0.5 text-xs text-tk-slate/60">
                        {[
                          report.cadence !== "none"
                            ? CADENCE_LABEL[report.cadence]
                            : null,
                          report.periodLabel || null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "One-off"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill tone={report.status === "due" ? "warn" : "good"}>
                        {report.status === "due" ? "Due" : "Filed"}
                      </StatusPill>
                      {report.slug && report.bodyPath ? (
                        <a
                          href={ROUTES.reportDoc(report.slug)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-semibold text-tk-teal hover:underline"
                        >
                          View
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Block>
          ) : null}

          {sortedProposals.length > 0 ? (
            <Block id="proposals" title="Proposals">
              <div className="divide-y divide-tk-slate/10 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
                {sortedProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-tk-onyx">
                        {proposal.title}
                      </p>
                      <p className="mt-0.5 text-xs text-tk-slate/60">
                        {[
                          proposal.seriesPart && proposal.seriesOf
                            ? `${proposal.series} · ${proposal.seriesPart} of ${proposal.seriesOf}`
                            : proposal.series || null,
                          PROPOSAL_STATUS_LABEL[proposal.status],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {proposal.slug && proposal.bodyPath ? (
                      <a
                        href={ROUTES.proposalDoc(proposal.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[11px] font-semibold text-tk-teal hover:underline"
                      >
                        View
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </Block>
          ) : null}

          {/* -------------------------------------------------- paid ads */}
          {adsViews.length > 0 ? (
            <Block
              id="ads"
              title="Paid Ads"
              action={
                <Link
                  href={`${ROUTES.paidAds}/${adsViews[0].site.slug}`}
                  className="text-xs font-semibold text-tk-teal hover:underline"
                >
                  Dashboard →
                </Link>
              }
            >
              <div className="space-y-3">
                {adsViews.map(({ site, snapshot }) => {
                  const ads = snapshot?.ads
                  const win = snapshot ? deriveWindow(snapshot, 28) : null
                  const totals = win?.totals
                  const currency = ads?.currency || "USD"
                  const rates = totals ? adsRates(totals) : null
                  return (
                    <Card key={site.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link
                            href={`${ROUTES.paidAds}/${site.slug}`}
                            className="text-[14.5px] font-bold text-tk-onyx hover:text-tk-teal"
                          >
                            {ads?.accountName || site.name}
                          </Link>
                          <p className="mt-0.5 font-mono text-xs text-tk-slate/60">
                            {fmtCustomerId(site.adsCustomerId)}
                            {win?.label ? ` · ${win.label}` : ""}
                          </p>
                        </div>
                        <Link
                          href={`${ROUTES.paidAds}/${site.slug}`}
                          className="text-[11px] font-semibold text-tk-teal hover:underline"
                        >
                          Open →
                        </Link>
                      </div>
                      {totals && ads?.ok ? (
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <HubAdStat
                            label="Spend"
                            value={fmtMoney(totals.adSpend, currency)}
                          />
                          <HubAdStat label="Clicks" value={fmtInt(totals.adClicks)} />
                          <HubAdStat
                            label="Conversions"
                            value={fmtConv(totals.adConversions)}
                          />
                          <HubAdStat
                            label="CPA"
                            value={
                              rates?.cpa == null
                                ? "—"
                                : fmtMoney(rates.cpa, currency)
                            }
                          />
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-tk-slate/60">
                          {snapshot
                            ? ads?.error ||
                              "Ads did not load on the last fetch — refresh from the dashboard."
                            : "Nothing fetched yet. Open the dashboard and fetch the snapshot."}
                        </p>
                      )}
                    </Card>
                  )
                })}
              </div>
            </Block>
          ) : null}

          {/* ------------------------------------------------ brainstorm */}
          {brainstorm.length > 0 ? (
            <Block id="brainstorm" title="Brainstorm">
              <div className="divide-y divide-tk-slate/10 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
                {brainstorm.map((note) => (
                  <div key={note.id} className="px-5 py-3">
                    <p className="text-[13.5px] text-tk-onyx">{note.body}</p>
                    <p className="mt-1 text-xs text-tk-slate/60">
                      {[
                        note.topic || null,
                        note.source === "mail" ? "from mail" : null,
                        formatDay(note.createdAt.toISOString().slice(0, 10)),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </Block>
          ) : null}

          {/* ------------------------------------------------ worksheets */}
          {sortedWorksheets.length > 0 ? (
            <Block id="worksheets" title="Worksheets">
              <div className="divide-y divide-tk-slate/10 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
                {sortedWorksheets.map((worksheet) => (
                  <div
                    key={worksheet.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-tk-onyx">
                        {worksheet.title}
                      </p>
                      <p className="mt-0.5 text-xs text-tk-slate/60">
                        {[
                          worksheet.instrument
                            ? `${worksheet.instrument}${worksheet.version ? ` ${worksheet.version}` : ""}`
                            : null,
                          WORKSHEET_MODE_LABEL[worksheet.mode],
                          WORKSHEET_STATUS_LABEL[worksheet.status],
                          worksheet.questionCount
                            ? `${worksheet.questionCount} questions`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {worksheet.openCount > 0 ? (
                        <StatusPill tone="warn">
                          {worksheet.openCount} open
                        </StatusPill>
                      ) : null}
                      {worksheet.slug && worksheet.bodyPath ? (
                        <a
                          href={ROUTES.worksheetDoc(worksheet.slug)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-semibold text-tk-teal hover:underline"
                        >
                          View
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Block>
          ) : null}
        </div>

        {/* ------------------------------------------------------- rail */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-12" aria-label="Client context">
          <RailCard title="Activity">
            <ActivityFeed items={hub.activity} />
          </RailCard>

          {hub.contacts.length > 0 || client.domains.length > 0 ? (
            <RailCard title="Contacts">
              {hub.contacts.length > 0 ? (
                <ul className="space-y-1.5">
                  {hub.contacts.map((email) => (
                    <li key={email} className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-tk-onyx">
                        {email.split("@")[0]}
                      </p>
                      <p className="truncate font-mono text-[11px] text-tk-slate/50">
                        {email}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-tk-slate/60">
                  No portal contacts yet · meeting invites match{" "}
                  {client.domains.map((d) => `@${d}`).join(", ")}
                </p>
              )}
            </RailCard>
          ) : null}

          {hub.sites.length > 0 ? (
            <RailCard title="Sites">
              <ul className="divide-y divide-tk-slate/10">
                {hub.sites.map((site) => (
                  <li
                    key={site.id}
                    className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
                  >
                    <span className="truncate font-mono text-xs text-tk-onyx">
                      {site.origin.replace(/^https?:\/\//, "") || site.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`${ROUTES.insights}/${site.slug}`}
                        className="text-xs font-semibold text-tk-teal hover:underline"
                      >
                        Insights
                      </Link>
                      {site.adsCustomerId ? (
                        <Link
                          href={`${ROUTES.paidAds}/${site.slug}`}
                          className="text-xs font-semibold text-tk-teal hover:underline"
                        >
                          Ads
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </RailCard>
          ) : null}

          {client.notionLinks.length > 0 ? (
            <RailCard title="Links">
              <ul className="divide-y divide-tk-slate/10">
                {client.notionLinks.map((link) => (
                  <li key={link.id} className="py-1.5 first:pt-0 last:pb-0">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 text-[13px] text-tk-onyx hover:text-tk-teal"
                    >
                      <span className="truncate">{link.title || "Untitled page"}</span>
                      <span className="shrink-0 text-[11px] text-tk-slate/45">
                        Notion ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </RailCard>
          ) : null}

          <RailCard title="Notes">
            <NotesCard clientId={client.id} initialNotes={client.notes} />
          </RailCard>
        </aside>
      </div>
    </>
  )
}

/* ---------------------------------------------------------- local pieces */

function monthName(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" })
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-tk-slate/15 bg-white px-4 py-3 shadow-sm">
      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-tk-slate/50">
        {label}
      </p>
      {children}
    </div>
  )
}

function Block({
  id,
  title,
  action,
  children,
}: {
  id: string
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-16">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold text-tk-onyx">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
      {children}
    </div>
  )
}

function HubAdStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tk-slate/50">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-tk-onyx">{value}</p>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "crit"
}) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tk-slate/50">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          tone === "crit" ? "text-[#A32C1E]" : "text-tk-onyx"
        )}
      >
        {value}
      </p>
    </div>
  )
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-tk-slate/15 bg-white px-4 py-3.5 shadow-sm">
      <h3 className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-tk-slate/50">
        {title}
      </h3>
      {children}
    </div>
  )
}
