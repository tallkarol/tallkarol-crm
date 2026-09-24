import Link from "next/link"
import { notFound } from "next/navigation"
import { BurnHistory } from "@/components/clients/BurnHistory"
import { HoursMeter } from "@/components/clients/HoursMeter"
import { NotesCard } from "@/components/clients/NotesCard"
import { StatusPill } from "@/components/clients/StatusPill"
import type { PillTone } from "@/components/clients/StatusPill"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { PunchlistList } from "@/components/punchlist/PunchlistList"
import { db } from "@/db"
import type { ProjectStatus } from "@/db/schema"
import { loadClientHub, UNPAID_INVOICE_FLAG_DAYS } from "@/lib/client-hub"
import { DOC_KIND_LABEL, latestDocsFor } from "@/lib/codebase-docs"
import type { DocKind } from "@/lib/codebase-docs"
import { cn } from "@/lib/cn"
import { retainerRateCents } from "@/lib/engagements"
import { adsRates, deriveWindow, fmtConv, fmtCustomerId, fmtInt, fmtMoney } from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"
import { ROUTES } from "@/lib/nav"
import { punchlistsFor } from "@/lib/punchlists"
import { notesForClient } from "@/lib/meeting-notes"
import { MeetingNoteList } from "@/components/meeting-notes/MeetingNoteList"
import { Card as TkCard } from "@/components/ui/Card"
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

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
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

type TabId = "projects" | "money" | "insights" | "ads"

function fmtH(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")
}

function daysSince(iso: string, now: Date) {
  const [y, m, d] = iso.split("-").map(Number)
  return Math.max(0, Math.floor((now.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000))
}

/**
 * The Dashboards room — everything that used to be the whole client hub,
 * now behind tabs the Board and Inbox rooms don't already own. `?tab=`
 * selects one panel at a time; the tab row itself is signed off from
 * `~/Work/tallkarol/hub-mockup-src/{tokens.css,parts.js}` (`.dtabs`/`.dpanel`,
 * `dashTabs()`/`renderDash()`).
 */
export default async function ClientDashboardsPage(
  props: {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ peek?: string; tab?: string }>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const now = new Date()
  const hub = await loadClientHub(params.slug, now)
  if (!hub) notFound()

  const { client } = hub

  const [brainstorm, clientPunchlists, clientMeetingNotes, siteContexts] = await Promise.all([
    db.query.brainstormNotes.findMany({
      where: (notes, { eq }) => eq(notes.clientId, client.id),
      orderBy: (notes, { desc }) => [desc(notes.createdAt)],
    }),
    punchlistsFor({ clientId: client.id }),
    notesForClient(client.id),
    Promise.all(
      hub.sites.map(async (site) => {
        const ctx = await getInsightsContext(site.slug)
        return { site, snapshot: ctx?.snapshot ?? null }
      })
    ),
  ])

  const adsViews = siteContexts.filter((v) => Boolean(v.site.adsCustomerId))
  const insightsViews = siteContexts.filter(
    (v): v is (typeof siteContexts)[number] & { snapshot: NonNullable<(typeof siteContexts)[number]["snapshot"]> } =>
      v.snapshot != null
  )

  const codebaseDocs = await latestDocsFor(client.id)
  const codebases = Array.from(new Set(codebaseDocs.map((d) => d.codebase)))

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  // Active = doing something right now; the not-started and complete piles
  // fold away instead of crowding the top of the tab.
  const activeProjects = client.projects.filter(
    (p) => p.status !== "complete" && p.status !== "not_started"
  )
  const notStartedProjects = client.projects.filter((p) => p.status === "not_started")
  const closedProjects = client.projects
    .filter((p) => p.status === "complete")
    .sort(
      (a, b) =>
        (b.completedAt ?? b.updatedAt).valueOf() - (a.completedAt ?? a.updatedAt).valueOf()
    )

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
  const sortedWorksheets = [...client.worksheets].sort((a, b) => b.openCount - a.openCount)

  const docRows: DocRow[] = [
    ...sortedReports.map((report) => ({
      key: `report:${report.id}`,
      kind: "Report",
      title: report.title,
      meta:
        [
          report.cadence !== "none" ? CADENCE_LABEL[report.cadence] : null,
          report.periodLabel || null,
        ]
          .filter(Boolean)
          .join(" · ") || "One-off",
      pill: {
        tone: (report.status === "due" ? "warn" : "good") as PillTone,
        label: report.status === "due" ? "Due" : "Filed",
      },
      href: report.slug && report.bodyPath ? ROUTES.reportDoc(report.slug) : undefined,
      external: true,
    })),
    ...sortedProposals.map((proposal) => ({
      key: `proposal:${proposal.id}`,
      kind: "Proposal",
      title: proposal.title,
      meta: [
        proposal.seriesPart && proposal.seriesOf
          ? `${proposal.series} · ${proposal.seriesPart} of ${proposal.seriesOf}`
          : proposal.series || null,
        PROPOSAL_STATUS_LABEL[proposal.status],
      ]
        .filter(Boolean)
        .join(" · "),
      href: proposal.slug && proposal.bodyPath ? ROUTES.proposalDoc(proposal.slug) : undefined,
      external: true,
    })),
    ...sortedWorksheets.map((worksheet) => ({
      key: `worksheet:${worksheet.id}`,
      kind: "Worksheet",
      title: worksheet.title,
      meta: [
        worksheet.instrument
          ? `${worksheet.instrument}${worksheet.version ? ` ${worksheet.version}` : ""}`
          : null,
        WORKSHEET_MODE_LABEL[worksheet.mode],
        WORKSHEET_STATUS_LABEL[worksheet.status],
        worksheet.questionCount ? `${worksheet.questionCount} questions` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      pill:
        worksheet.openCount > 0
          ? ({ tone: "warn" as PillTone, label: `${worksheet.openCount} open` })
          : undefined,
      href: worksheet.slug && worksheet.bodyPath ? ROUTES.worksheetDoc(worksheet.slug) : undefined,
      external: true,
    })),
    ...sortedContracts.map((contract) => ({
      key: `contract:${contract.id}`,
      kind: "Contract",
      title: contract.title,
      meta:
        [
          contract.effectiveOn ? `Effective ${formatDay(contract.effectiveOn)}` : null,
          contract.feeCents ? formatMoney(contract.feeCents) : null,
        ]
          .filter(Boolean)
          .join(" · ") || "No effective date",
      pill: {
        tone: (contract.status === "signed"
          ? "good"
          : contract.status === "sent"
            ? "warn"
            : "muted") as PillTone,
        label: CONTRACT_STATUS_LABEL[contract.status],
      },
      href: ROUTES.contract(contract.slug),
      external: false,
    })),
  ]

  const hasProjectWork =
    activeProjects.length > 0 ||
    notStartedProjects.length > 0 ||
    closedProjects.length > 0 ||
    client.products.length > 0

  const hasProjectsContent =
    hasProjectWork ||
    docRows.length > 0 ||
    codebases.length > 0 ||
    clientPunchlists.length > 0 ||
    clientMeetingNotes.length > 0 ||
    brainstorm.length > 0 ||
    hub.contacts.length > 0 ||
    client.domains.length > 0 ||
    client.notionLinks.length > 0 ||
    client.notes.trim().length > 0

  const activeRetainers = client.retainers.filter((r) => r.status === "active")
  const hasActiveRetainer = activeRetainers.length > 0
  const hasMoneyContent =
    hasActiveRetainer || client.invoices.length > 0 || client.contracts.length > 0

  /* ---- money tab pace math, only meaningful against a cap ---- */
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const pacePct = hub.monthCap > 0 ? (dayOfMonth / daysInMonth) * 100 : null
  const loggedPct = hub.monthCap > 0 ? (hub.monthHours / hub.monthCap) * 100 : null
  const behindPace = pacePct != null && loggedPct != null && loggedPct < pacePct - 10
  const expectedByNow = hub.monthCap > 0 ? hub.monthCap * (dayOfMonth / daysInMonth) : 0
  const hoursShort = Math.max(0, expectedByNow - hub.monthHours)
  const unusedHours = Math.max(0, hub.monthCap - hub.monthHours)
  const paceNote = hasActiveRetainer
    ? behindPace
      ? `behind pace · ${fmtH(hoursShort)} h short of day ${dayOfMonth}`
      : "on pace"
    : undefined

  /* ---- tabs, in the signed-off order, only when they have something ---- */
  const tabs: { id: TabId; label: string; value?: string }[] = []
  if (hasProjectsContent) {
    tabs.push({
      id: "projects",
      label: "Projects & Docs",
      value: activeProjects.length > 0 ? String(activeProjects.length) : undefined,
    })
  }
  if (hasMoneyContent) {
    tabs.push({
      id: "money",
      label: hasActiveRetainer ? "Retainer & Money" : "Money",
      value: `${fmtH(hub.monthHours)}h`,
    })
  }
  if (insightsViews.length > 0) {
    tabs.push({ id: "insights", label: "Insights", value: "28d" })
  }
  if (adsViews.length > 0) {
    const primary = adsViews.find((v) => v.snapshot?.ads?.ok)
    const adsValue = primary?.snapshot
      ? fmtMoney(deriveWindow(primary.snapshot, 28).totals.adSpend, primary.snapshot.ads.currency || "USD")
      : undefined
    tabs.push({ id: "ads", label: "Paid Ads", value: adsValue })
  }

  const requested = searchParams.tab
  const tab: TabId | null = tabs.some((t) => t.id === requested)
    ? (requested as TabId)
    : tabs[0]?.id ?? null

  return (
    <>
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.clientRoom(client.slug, "dashboards")} />
      ) : null}

      {tabs.length > 0 ? (
        <nav aria-label="Dashboards" role="tablist" className="flex flex-wrap items-center gap-1">
          {tabs.map((t) => (
            <DashTab
              key={t.id}
              href={`${ROUTES.clientRoom(client.slug, "dashboards")}?tab=${t.id}`}
              active={t.id === tab}
              label={t.label}
              value={t.value}
            />
          ))}
        </nav>
      ) : null}

      <div role="tabpanel" className="mt-2.5 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5">
        {tab === "projects" ? (
          <div className="flex flex-col gap-5">
            {hasProjectWork ? (
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-[13px] font-bold text-tk-onyx">Projects</h3>
                  <p className="text-[11.5px] text-ink-3">
                    {[
                      activeProjects.length > 0 ? `${activeProjects.length} in progress` : null,
                      notStartedProjects.length > 0 ? `${notStartedProjects.length} not started` : null,
                      closedProjects.length > 0 ? `${closedProjects.length} complete` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {activeProjects.length > 0 || client.products.length > 0 ? (
                  <div className="mt-2.5 space-y-3">
                    {activeProjects.map((project) => {
                      const fee = project.deliverables.reduce(
                        (sum, d) => sum + (d.feeCents ?? 0),
                        0
                      )
                      const done = project.deliverables.filter((d) => d.status !== "pending").length
                      return (
                        <Card key={project.id}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <Link
                                href={ROUTES.clientProject(client.slug, project.slug)}
                                className="text-[14.5px] font-bold text-tk-onyx hover:text-tk-teal"
                              >
                                {project.name}
                              </Link>
                              <p className="mt-0.5 text-xs text-ink-3">
                                {fee > 0 ? (
                                  <>
                                    Fee <span className="tabular-nums">{formatMoney(fee)}</span>
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
                                    <li key={d.id} className="flex items-center gap-2.5 text-[13px]">
                                      <span
                                        aria-hidden="true"
                                        className={cn(
                                          "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                                          finished
                                            ? "border-tk-teal bg-accent text-white"
                                            : "border-line-strong bg-card"
                                        )}
                                      >
                                        {finished ? (
                                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
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
                                            ? "text-ink-3 line-through decoration-ink-3"
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
                                            d.dueOn < today ? "text-bad" : "text-ink-3"
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
                              <p className="mt-0.5 text-xs text-ink-3">{product.tagline}</p>
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
                ) : null}

                {notStartedProjects.length > 0 || closedProjects.length > 0 ? (
                  <div className="mt-2.5 space-y-2">
                    {notStartedProjects.length > 0 ? (
                      <ProjectFold
                        clientSlug={client.slug}
                        label={`${notStartedProjects.length} not started`}
                        projects={notStartedProjects}
                      />
                    ) : null}
                    {closedProjects.length > 0 ? (
                      <ProjectFold
                        clientSlug={client.slug}
                        label={`${closedProjects.length} completed project${closedProjects.length === 1 ? "" : "s"}`}
                        projects={closedProjects}
                        showDate
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {docRows.length > 0 ? (
              <Section title="Documents">
                <TkCard className="divide-y divide-line overflow-hidden">
                  {docRows.map((row) => (
                    <div key={row.key} className="flex items-center gap-4 px-5 py-3">
                      <span className="w-[70px] shrink-0 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-3">
                        {row.kind}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-tk-onyx">{row.title}</p>
                        <p className="mt-0.5 text-xs text-ink-3">{row.meta}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {row.pill ? <StatusPill tone={row.pill.tone}>{row.pill.label}</StatusPill> : null}
                        {row.href ? (
                          row.external ? (
                            <a
                              href={row.href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold text-tk-teal hover:underline"
                            >
                              View
                            </a>
                          ) : (
                            <Link
                              href={row.href}
                              className="text-[11px] font-semibold text-tk-teal hover:underline"
                            >
                              View
                            </Link>
                          )
                        ) : null}
                      </div>
                    </div>
                  ))}
                </TkCard>
              </Section>
            ) : null}

            {codebases.length > 0 ? (
              <Section title="Codebases">
                <TkCard className="divide-y divide-line overflow-hidden">
                  {codebases.map((cb) => {
                    const docs = codebaseDocs.filter((d) => d.codebase === cb)
                    const spec = docs.find((d) => d.kind === "spec")
                    const newest = docs.reduce((a, b) => (a.generatedAt > b.generatedAt ? a : b))
                    return (
                      <Link
                        key={cb}
                        href={`${ROUTES.client(client.slug)}/codebases/${cb}`}
                        className="block px-5 py-3 hover:bg-well"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-tk-onyx">
                            {spec?.title || cb}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-ink-3">
                            {newest.generatedAt.toISOString().slice(0, 10)}
                          </span>
                        </span>
                        {spec?.summary ? (
                          <span className="mt-0.5 block truncate text-xs text-ink-3">{spec.summary}</span>
                        ) : null}
                        <span className="mt-0.5 block text-[10.5px] text-ink-3">
                          {docs.map((d) => DOC_KIND_LABEL[d.kind as DocKind] ?? d.kind).join(" · ")}
                        </span>
                      </Link>
                    )
                  })}
                </TkCard>
              </Section>
            ) : null}

            {clientPunchlists.length > 0 ? (
              <Section title="Punch lists">
                <PunchlistList
                  rows={clientPunchlists}
                  peekBase={ROUTES.clientRoom(client.slug, "dashboards")}
                />
              </Section>
            ) : null}

            {clientMeetingNotes.length > 0 ? (
              <Section
                title="Meeting notes"
                action={
                  <Link
                    href={ROUTES.meetingNotes}
                    className="text-[11px] font-semibold text-tk-teal hover:underline"
                  >
                    All notes
                  </Link>
                }
              >
                <MeetingNoteList rows={clientMeetingNotes} />
              </Section>
            ) : null}

            {brainstorm.length > 0 ? (
              <Section title="Brainstorm">
                <TkCard className="divide-y divide-line overflow-hidden">
                  {brainstorm.map((note) => (
                    <div key={note.id} className="px-5 py-3">
                      <p className="text-[13.5px] text-tk-onyx">{note.body}</p>
                      <p className="mt-1 text-xs text-ink-3">
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
                </TkCard>
              </Section>
            ) : null}

            <Section title="Client">
              {hub.contacts.length > 0 ||
              client.domains.length > 0 ||
              client.notionLinks.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {hub.contacts.length > 0 || client.domains.length > 0 ? (
                    <MiniCard title="Contacts">
                      {hub.contacts.length > 0 ? (
                        <ul className="space-y-1.5">
                          {hub.contacts.map((email) => (
                            <li key={email} className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-tk-onyx">
                                {email.split("@")[0]}
                              </p>
                              <p className="truncate font-mono text-[11px] text-ink-3">{email}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-ink-3">
                          No portal contacts yet · meeting invites match{" "}
                          {client.domains.map((d) => `@${d}`).join(", ")}
                        </p>
                      )}
                    </MiniCard>
                  ) : null}

                  {client.notionLinks.length > 0 ? (
                    <MiniCard title="Links">
                      <ul className="divide-y divide-line">
                        {client.notionLinks.map((link) => (
                          <li key={link.id} className="py-1.5 first:pt-0 last:pb-0">
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-2 text-[13px] text-tk-onyx hover:text-tk-teal"
                            >
                              <span className="truncate">{link.title || "Untitled page"}</span>
                              <span className="shrink-0 text-[11px] text-ink-3">Notion ↗</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </MiniCard>
                  ) : null}
                </div>
              ) : null}

              <div
                className={
                  hub.contacts.length > 0 || client.domains.length > 0 || client.notionLinks.length > 0
                    ? "mt-3"
                    : undefined
                }
              >
                <MiniCard title="Notes">
                  <NotesCard clientId={client.id} initialNotes={client.notes} />
                </MiniCard>
              </div>
            </Section>
          </div>
        ) : tab === "money" ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-[13px] font-bold text-tk-onyx">
                {hasActiveRetainer ? "Retainer & Money" : "Money"}
              </h3>
              {hasActiveRetainer ? (
                <p className="text-[11.5px] text-ink-3">{hub.monthCap} hr/mo</p>
              ) : null}
              <Link
                href={ROUTES.invoices}
                className="text-[11px] font-semibold text-tk-teal hover:underline"
              >
                All invoices →
              </Link>
            </div>

            {hub.burns.length > 0 ? (
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
                          <p className="mt-0.5 text-xs text-ink-3">
                            <span className="tabular-nums">{retainer.hoursPerMonth}</span> hr/mo
                            {rate ? (
                              <>
                                {" "}
                                · <span className="tabular-nums">{formatMoney(rate)}</span>/hr
                              </>
                            ) : null}
                            {retainer.startsOn ? ` · since ${formatDay(retainer.startsOn)}` : null}
                          </p>
                        </div>
                        <StatusPill tone={retainer.status === "active" ? "good" : "muted"}>
                          {RETAINER_STATUS_LABEL[retainer.status]}
                        </StatusPill>
                      </div>
                      {retainer.status === "active" ? (
                        <div className="mt-4 flex flex-wrap items-end gap-6">
                          <div className="min-w-[200px] flex-1">
                            <div className="mb-1.5 flex justify-between text-xs text-ink-3">
                              <span>{monthName(hub.month)}</span>
                              <span className="tabular-nums">
                                {fmtH(monthHours)} / {retainer.hoursPerMonth} hr
                              </span>
                            </div>
                            <HoursMeter logged={monthHours} cap={retainer.hoursPerMonth} className="h-2" />
                          </div>
                          <BurnHistory history={history} cap={retainer.hoursPerMonth} currentMonth={hub.month} />
                        </div>
                      ) : null}
                    </Card>
                  )
                })}
              </div>
            ) : null}

            <TkCard className="overflow-hidden">
              <div className="flex flex-wrap gap-8 border-b border-line px-5 py-4">
                {hasActiveRetainer ? (
                  <>
                    <Stat
                      label={`Logged · ${monthName(hub.month)}`}
                      value={`${fmtH(hub.monthHours)} / ${hub.monthCap} hr`}
                      note={paceNote}
                      noteTone={behindPace ? "warn" : "good"}
                    />
                    <Stat
                      label="Unused"
                      value={`${fmtH(unusedHours)} hr`}
                      note={`${Math.max(0, daysInMonth - dayOfMonth)} days left`}
                    />
                  </>
                ) : null}
                <Stat
                  label="Outstanding"
                  value={formatMoney(hub.outstandingCents)}
                  tone={hub.outstandingCents > 0 ? "crit" : undefined}
                  note={hub.outstandingCents > 0 ? undefined : "nothing unpaid"}
                  noteTone="good"
                />
                <Stat label="Billed YTD" value={formatMoney(hub.billedYtdCents)} />
                <Stat
                  label="Avg / month"
                  value={formatMoney(Math.round(hub.billedYtdCents / (now.getMonth() + 1)))}
                />
              </div>
              {recentInvoices.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left sm:min-w-[540px]">
                    <thead>
                      <tr className="border-b border-line text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                        <th className="px-3 py-2.5 font-bold sm:px-5">Invoice</th>
                        <th className="hidden px-3 py-2.5 font-bold sm:table-cell">Issued</th>
                        <th className="hidden px-3 py-2.5 font-bold sm:table-cell">For</th>
                        <th className="hidden px-3 py-2.5 text-right font-bold sm:table-cell">Hours</th>
                        <th className="px-3 py-2.5 text-right font-bold">Amount</th>
                        <th className="px-3 py-2.5 font-bold sm:px-5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInvoices.map((invoice) => {
                        const age = daysSince(invoice.issuedOn, now)
                        return (
                          <tr key={invoice.id} className="border-b border-line text-[13.5px] last:border-0 hover:bg-well">
                            <td className="px-5 py-2.5">
                              <Link
                                href={ROUTES.invoice(invoice.number)}
                                className="font-semibold tabular-nums text-tk-onyx hover:text-tk-teal"
                              >
                                {invoice.number}
                              </Link>
                            </td>
                            <td className="hidden px-3 py-2.5 tabular-nums text-ink-3 sm:table-cell">
                              {formatDay(invoice.issuedOn)}
                            </td>
                            <td className="hidden max-w-[220px] truncate px-3 py-2.5 text-ink-3 sm:table-cell">
                              {invoice.description || "—"}
                            </td>
                            <td className="hidden px-3 py-2.5 text-right tabular-nums text-ink-3 sm:table-cell">
                              {invoice.hours ? formatHours(invoice.hours) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-tk-onyx">
                              {formatMoney(invoice.amountCents, invoice.currency)}
                            </td>
                            <td className="px-5 py-2.5">
                              {invoice.status === "paid" ? (
                                <StatusPill tone="good">Paid</StatusPill>
                              ) : invoice.status === "sent" ? (
                                <StatusPill tone={age >= UNPAID_INVOICE_FLAG_DAYS ? "crit" : "teal"}>
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
            </TkCard>

            {sortedContracts.length > 0 ? (
              <TkCard className="divide-y divide-line overflow-hidden">
                {sortedContracts.map((contract) => (
                  <Link
                    key={contract.id}
                    href={ROUTES.contract(contract.slug)}
                    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-well"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-tk-onyx">{contract.title}</p>
                      <p className="mt-0.5 text-xs text-ink-3">
                        {[
                          contract.effectiveOn ? `Effective ${formatDay(contract.effectiveOn)}` : null,
                          contract.feeCents ? formatMoney(contract.feeCents) : null,
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
              </TkCard>
            ) : null}
          </div>
        ) : tab === "insights" ? (
          <div className="space-y-3">
            {insightsViews.map(({ site, snapshot }) => {
              const win = deriveWindow(snapshot, 28)
              const { totals } = win
              const hasGa4 = snapshot.ga4.ok
              const hasGsc = snapshot.gsc.ok
              const topPages = hasGa4
                ? [...snapshot.ga4.pages].sort((a, b) => b.sessions - a.sessions).slice(0, 6)
                : []
              return (
                <Card key={site.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`${ROUTES.insights}/${site.slug}`}
                        className="text-[14.5px] font-bold text-tk-onyx hover:text-tk-teal"
                      >
                        {site.name}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-ink-3">{win.label}</p>
                    </div>
                    <Link
                      href={`${ROUTES.insights}/${site.slug}`}
                      className="text-[11px] font-semibold text-tk-teal hover:underline"
                    >
                      Insights hub →
                    </Link>
                  </div>
                  {hasGa4 || hasGsc ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {hasGa4 ? <HubAdStat label="Sessions" value={fmtInt(totals.sessions)} /> : null}
                      {hasGsc ? <HubAdStat label="Search clicks" value={fmtInt(totals.clicks)} /> : null}
                      {hasGsc ? <HubAdStat label="Impressions" value={fmtInt(totals.impressions)} /> : null}
                      {hasGa4 ? <HubAdStat label="Key events" value={fmtInt(totals.keyEvents)} /> : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-ink-3">Not connected yet.</p>
                  )}
                  {topPages.length > 0 ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs sm:min-w-[420px]">
                        <thead>
                          <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wide text-ink-3">
                            <th className="py-2 font-bold">Top pages</th>
                            <th className="px-3 py-2 text-right font-bold">Sessions</th>
                            <th className="hidden px-3 py-2 text-right font-bold sm:table-cell">Key events</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topPages.map((row) => (
                            <tr key={row.name} className="border-b border-line last:border-0">
                              <td
                                className="max-w-[10rem] truncate py-2 font-medium text-tk-onyx sm:max-w-[22rem]"
                                title={row.name}
                              >
                                {row.name}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                                {fmtInt(row.sessions)}
                              </td>
                              <td className="hidden px-3 py-2 text-right tabular-nums text-tk-onyx sm:table-cell">
                                {fmtInt(row.keyEvents)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </Card>
              )
            })}
          </div>
        ) : tab === "ads" ? (
          <div>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-[13px] font-bold text-tk-onyx">Paid Ads</h3>
              <Link
                href={`${ROUTES.paidAds}/${adsViews[0].site.slug}`}
                className="text-[11px] font-semibold text-tk-teal hover:underline"
              >
                Dashboard →
              </Link>
            </div>
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
                        <p className="mt-0.5 font-mono text-xs text-ink-3">
                          {fmtCustomerId(site.adsCustomerId ?? "")}
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
                        <HubAdStat label="Spend" value={fmtMoney(totals.adSpend, currency)} />
                        <HubAdStat label="Clicks" value={fmtInt(totals.adClicks)} />
                        <HubAdStat label="Conversions" value={fmtConv(totals.adConversions)} />
                        <HubAdStat
                          label="CPA"
                          value={rates?.cpa == null ? "—" : fmtMoney(rates.cpa, currency)}
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-ink-3">
                        {snapshot
                          ? ads?.error || "Ads did not load on the last fetch — refresh from the dashboard."
                          : "Nothing fetched yet. Open the dashboard and fetch the snapshot."}
                      </p>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line bg-well px-6 py-8 text-center text-sm text-ink-3">
            Nothing to show yet.
          </p>
        )}
      </div>
    </>
  )
}

/* ---------------------------------------------------------- local pieces */

type DocRow = {
  key: string
  kind: string
  title: string
  meta: string
  pill?: { tone: PillTone; label: string }
  href?: string
  external?: boolean
}

function monthName(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" })
}

function DashTab({
  href,
  active,
  label,
  value,
}: {
  href: string
  active: boolean
  label: string
  value?: string
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold font-ui transition-colors",
        active ? "bg-tk-onyx text-tk-linen" : "text-ink-3 hover:bg-well hover:text-tk-onyx"
      )}
    >
      {label}
      {value ? (
        <span className="font-mono text-[10px] font-bold tabular-nums">{value}</span>
      ) : null}
    </Link>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-line pt-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-bold text-tk-onyx">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <TkCard className="px-5 py-4">{children}</TkCard>
}

function MiniCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <TkCard className="px-4 py-3.5">
      <h4 className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3">{title}</h4>
      {children}
    </TkCard>
  )
}

function ProjectFold({
  clientSlug,
  label,
  projects,
  showDate,
}: {
  clientSlug: string
  label: string
  projects: { id: string; slug: string; name: string; completedAt?: Date | null }[]
  showDate?: boolean
}) {
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-ink-3 hover:text-tk-onyx">
          <span>{label}</span>
          <span aria-hidden="true" className="text-ink-3 group-open:hidden">
            Show
          </span>
          <span aria-hidden="true" className="hidden text-ink-3 group-open:inline">
            Hide
          </span>
        </summary>
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]"
            >
              <Link href={ROUTES.clientProject(clientSlug, project.slug)} className="text-tk-slate hover:text-tk-teal">
                {project.name}
              </Link>
              {showDate && project.completedAt ? (
                <span className="text-[11px] tabular-nums text-ink-3">
                  {formatDay(project.completedAt.toISOString().slice(0, 10))}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}

function HubAdStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-tk-onyx">{value}</p>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  note,
  noteTone,
}: {
  label: string
  value: string
  tone?: "crit"
  note?: string
  noteTone?: "good" | "warn" | "crit"
}) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", tone === "crit" ? "text-bad" : "text-tk-onyx")}>
        {value}
      </p>
      {note ? (
        <p
          className={cn(
            "mt-0.5 text-[11px] font-semibold",
            noteTone === "warn"
              ? "text-warn"
              : noteTone === "crit"
                ? "text-bad"
                : noteTone === "good"
                  ? "text-good"
                  : "text-ink-3"
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  )
}
