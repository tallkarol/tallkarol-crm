import { desc } from "drizzle-orm"
import { db } from "@/db"
import type {
  Deliverable,
  FeeStatus,
  Invoice,
  ProjectStatus,
  RetainerStatus,
  Workstream,
} from "@/db/schema"
import {
  projectAttention,
  projectBand,
  retainerAttention,
  retainerBand,
  type AttentionFlag,
  type BandId,
  type InvoiceFacts,
  type TicketFacts,
} from "@/lib/attention"
import { clientColor } from "@/lib/client-colors"
import { hoursByMonth, retainerRateCents, ym } from "@/lib/engagements"
import { ticketPriority, ticketState } from "@/lib/support"
import { WORKSTREAM_STAGES } from "@/lib/pipeline"
import { PROJECT_STATUS_LABEL, RETAINER_STATUS_LABEL } from "@/lib/work"

/**
 * Everything the delivery ledger renders, shaped once on the server.
 *
 * A row is an *engagement* — a project or a retainer — because that is the
 * unit you scan and act on. Workstreams collapse into a five-segment rail
 * rather than getting rows of their own, and the money on a row is whatever
 * that engagement is currently sitting on.
 */

export type StageRail = { stage: string; label: string; count: number; stale: boolean }

export type DeliveryRow = {
  kind: "project" | "retainer"
  id: string
  slug: string
  name: string
  clientName: string
  clientSlug: string
  color: string
  /** The primary status menu on the row. */
  status: string
  statusLabel: string
  feeStatus: FeeStatus | null
  /** Projects: the workstream rail. Retainers: null. */
  rail: StageRail[] | null
  railNote: string
  /** Retainers: the month against its ceiling. Projects: null. */
  capacity: { hours: number; cap: number; pct: number } | null
  /** Money the row is sitting on — unbilled work, or a draft invoice. */
  moneyCents: number | null
  moneyNote: string
  flags: AttentionFlag[]
  band: BandId
  openTickets: number
}

export type DeliveryTotals = {
  needsYou: number
  hotRows: number
  projectsInDelivery: number
  workstreams: number
  retainerHours: number
  retainerCap: number
  unbilledCents: number
  unbilledCount: number
  draftCents: number
  draftNote: string
}

export type DeliveryData = {
  rows: DeliveryRow[]
  totals: DeliveryTotals
  clients: { slug: string; name: string; color: string }[]
}

/** A deliverable counts as billable when it is finished and carries a fee. */
function unbilled(deliverables: Deliverable[]) {
  return deliverables.filter((d) => d.status === "done" && (d.feeCents ?? 0) > 0)
}

function toInvoiceFacts(rows: Invoice[]): InvoiceFacts[] {
  return rows.map((i) => ({
    number: i.number,
    status: i.status,
    issuedOn: i.issuedOn,
    amountCents: i.amountCents,
  }))
}

/**
 * Tickets, per client, reduced to what the rules need. A ticket counts as
 * answered once we have replied — `firstResponseAt` is what the console sets.
 */
function ticketFactsByClient(
  tickets: {
    clientId: string | null
    state: string
    status: string
    completed: boolean
    priority: string
    firstResponseAt: Date | null
    submittedOn: string | null
    createdAt: Date
  }[],
  now: Date
) {
  const byClient = new Map<string, TicketFacts[]>()
  for (const t of tickets) {
    if (!t.clientId) continue
    if (ticketState(t) === "closed") continue
    const opened = t.submittedOn ? new Date(`${t.submittedOn}T00:00:00`) : t.createdAt
    const list = byClient.get(t.clientId) ?? []
    list.push({
      priority: ticketPriority(t.priority),
      ageDays: Math.max(0, Math.floor((now.getTime() - opened.getTime()) / 86_400_000)),
      answered: t.firstResponseAt != null,
    })
    byClient.set(t.clientId, list)
  }
  return byClient
}

function buildRail(streams: Workstream[], now: Date): { rail: StageRail[]; note: string } {
  const rail = WORKSTREAM_STAGES.map((stage) => {
    const inStage = streams.filter((w) => w.stage === stage.id)
    const stale = inStage.some(
      (w) =>
        (stage.id === "review" || stage.id === "feedback") &&
        (now.getTime() - w.updatedAt.getTime()) / 86_400_000 >= 5
    )
    return { stage: stage.id, label: stage.label, count: inStage.length, stale }
  })
  const busy = rail.filter((s) => s.count > 0)
  const note =
    busy.length === 0
      ? "no workstreams"
      : busy.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(" · ")
  return { rail, note }
}

export async function loadDelivery(now = new Date()): Promise<DeliveryData> {
  const [projects, retainers, invoices, entries, tickets, openTasks] = await Promise.all([
    db.query.projects.findMany({
      with: {
        client: true,
        deliverables: true,
        workstreams: { orderBy: (w, { asc }) => [asc(w.sort), asc(w.createdAt)] },
      },
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    }),
    db.query.retainers.findMany({ with: { client: true } }),
    db.query.invoices.findMany({ orderBy: (i) => [desc(i.issuedOn)] }),
    db.query.timeEntries.findMany(),
    db.query.supportTickets.findMany().catch(() => []),
    db.query.tasks
      .findMany()
      .then((rows) => rows.filter((t) => t.status === "open"))
      .catch(() => []),
  ])

  const thisMonth = ym(now)
  const ticketsByClient = ticketFactsByClient(tickets, now)

  const rows: DeliveryRow[] = []

  /* ------------------------------------------------------------- projects */
  for (const p of projects) {
    const projectInvoices = invoices.filter((i) => i.projectId === p.id)
    const clientTickets = ticketsByClient.get(p.clientId) ?? []
    const facts = {
      status: p.status as ProjectStatus,
      updatedAt: p.updatedAt,
      workstreams: p.workstreams.map((w) => ({
        title: w.title,
        stage: w.stage,
        updatedAt: w.updatedAt,
      })),
      deliverables: p.deliverables.map((d) => ({
        label: d.label,
        title: d.title,
        status: d.status,
        feeCents: d.feeCents,
        dueOn: d.dueOn,
      })),
      invoices: toInvoiceFacts(projectInvoices),
      // Ticket noise belongs to the client, so it hangs off retainers, not
      // every project that client happens to have open.
      tickets: [] as TicketFacts[],
    }
    const flags = projectAttention(facts, now)
    const { rail, note } = buildRail(p.workstreams, now)
    const owed = unbilled(p.deliverables)
    const owedCents = owed.reduce((sum, d) => sum + (d.feeCents ?? 0), 0)
    const draft = projectInvoices.find((i) => i.status === "draft")

    rows.push({
      kind: "project",
      id: p.id,
      slug: p.slug,
      name: p.name,
      clientName: p.client.name,
      clientSlug: p.client.slug,
      color: clientColor(p.client.slug),
      status: p.status,
      statusLabel: PROJECT_STATUS_LABEL[p.status],
      feeStatus: p.feeStatus,
      rail,
      railNote: note,
      capacity: null,
      moneyCents: owedCents > 0 ? owedCents : draft ? draft.amountCents : null,
      moneyNote: owedCents > 0 ? "ready to invoice" : draft ? "draft invoice" : "",
      flags,
      band: projectBand(facts, flags, now),
      openTickets: clientTickets.length,
    })
  }

  /* ------------------------------------------------------------ retainers */
  for (const r of retainers) {
    const retainerInvoices = invoices.filter((i) => i.retainerId === r.id)
    const hours = hoursByMonth(entries, r.id).get(thisMonth) ?? 0
    const rate = retainerRateCents(r, invoices)
    const clientTickets = ticketsByClient.get(r.clientId) ?? []
    const hasRenewalTask = openTasks.some(
      (t) => t.retainerId === r.id && /renew/i.test(t.title)
    )
    const facts = {
      status: r.status as RetainerStatus,
      hoursPerMonth: r.hoursPerMonth,
      endsOn: r.endsOn,
      hoursThisMonth: Math.round(hours * 100) / 100,
      invoicedThisMonth: retainerInvoices.some((i) => i.issuedOn.slice(0, 7) === thisMonth),
      invoices: toInvoiceFacts(retainerInvoices),
      tickets: clientTickets,
      hasRenewalTask,
    }
    const flags = retainerAttention(facts, now)
    const draft = retainerInvoices.find((i) => i.status === "draft")
    const accrued = rate ? Math.round(hours * rate) : null

    rows.push({
      kind: "retainer",
      id: r.id,
      slug: r.slug,
      name: `Retainer · ${r.hoursPerMonth}h`,
      clientName: r.client.name,
      clientSlug: r.client.slug,
      color: clientColor(r.client.slug),
      status: r.status,
      statusLabel: RETAINER_STATUS_LABEL[r.status],
      feeStatus: null,
      rail: null,
      railNote: "",
      capacity: {
        hours: facts.hoursThisMonth,
        cap: r.hoursPerMonth,
        pct: r.hoursPerMonth > 0 ? Math.min(1, hours / r.hoursPerMonth) : 0,
      },
      moneyCents: draft ? draft.amountCents : accrued && accrued > 0 ? accrued : null,
      moneyNote: draft ? "draft invoice" : accrued && accrued > 0 ? "accrued" : "",
      flags,
      band: retainerBand(facts, flags),
      openTickets: clientTickets.length,
    })
  }

  /* --------------------------------------------------------------- totals */
  const projectRows = rows.filter((r) => r.kind === "project")
  const retainerRows = rows.filter((r) => r.kind === "retainer" && r.band !== "closed")

  const allUnbilled = projects.flatMap((p) => unbilled(p.deliverables))
  const drafts = invoices.filter((i) => i.status === "draft")

  const totals: DeliveryTotals = {
    needsYou: rows.filter((r) => r.band === "needs-you").length,
    hotRows: rows.filter((r) => r.flags.some((f) => f.severity === "hot")).length,
    projectsInDelivery: projectRows.filter((r) => r.status === "in_progress").length,
    workstreams: projects
      .filter((p) => p.status === "in_progress")
      .reduce((sum, p) => sum + p.workstreams.length, 0),
    retainerHours:
      Math.round(retainerRows.reduce((sum, r) => sum + (r.capacity?.hours ?? 0), 0) * 10) / 10,
    retainerCap: retainerRows.reduce((sum, r) => sum + (r.capacity?.cap ?? 0), 0),
    unbilledCents: allUnbilled.reduce((sum, d) => sum + (d.feeCents ?? 0), 0),
    unbilledCount: allUnbilled.length,
    draftCents: drafts.reduce((sum, i) => sum + i.amountCents, 0),
    draftNote:
      drafts.length === 1
        ? `${drafts[0].number} · issues ${drafts[0].issuedOn}`
        : drafts.length > 1
          ? `${drafts.length} invoices`
          : "nothing waiting",
  }
  const clients = Array.from(
    new Map(rows.map((r) => [r.clientSlug, { slug: r.clientSlug, name: r.clientName, color: r.color }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  return { rows, totals, clients }
}
