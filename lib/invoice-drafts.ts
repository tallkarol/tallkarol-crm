import { and, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm"
import { db } from "@/db"
import { clients, deliverables, invoices, timeEntries } from "@/db/schema"
import type { Invoice } from "@/db/schema"
import { retainerRateCents } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import { occurredOnIn } from "@/lib/punch"
import { listSheets } from "@/lib/sheets"
import { hoursToString, invoiceNumberFor, monthBounds, monthEnd, monthLong, sumHours } from "@/lib/timesheet"
import { workspaceTimezone } from "@/lib/timezone"
import { formatMoneyRaw } from "@/lib/work"

/**
 * Invoice drafts for the chat. Two kinds of bill, the two the house issues:
 *
 * - **Hours** — one client-month of unbilled timesheet lines, at the
 *   retainer's rate. Numbered the way that client's invoices already run: the
 *   NNN-M / NNN-Z sequence when it has one, else SLUG-YYYY-MM (GDI-2026-09).
 *   The month's unbilled lines are linked to the draft, as the timesheet's own
 *   "create invoice" does, so they stop counting as unbilled.
 * - **Deliverable** — a fixed fee from a project deliverable (DQS's D2),
 *   numbered on the client's PREFIX-NNN sequence when it has one.
 *
 * A draft is only a draft: nothing here sends, marks sent, or marks paid —
 * that stays Karol's, on the invoice page. One draft per client-month and one
 * per deliverable, so confirming a card twice finds the first draft instead
 * of writing a second.
 */

export type DraftResult<T> = { ok: true; data: T } | { ok: false; error: string }

type InvoiceRow = Pick<Invoice, "id" | "number" | "clientId" | "retainerId" | "deliverableId" | "issuedOn" | "status" | "amountCents" | "hours" | "billTo">

/** The next number on a sequence; capture group `counter` holds the digits. */
function nextInSequence(
  numbers: string[],
  pattern: RegExp,
  counter: number,
  render: (n: number, m: RegExpExecArray) => string
): string | null {
  const matches = numbers
    .map((n) => pattern.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(b[counter]) - Number(a[counter]))
  if (!matches.length) return null
  const top = matches[0]
  return render(Number(top[counter]) + 1, top)
}

function billToFor(clientName: string, own: InvoiceRow[]) {
  return own.find((i) => i.billTo.trim())?.billTo ?? clientName
}

/* ------------------------------------------------------------ overview */

export type BillingOverview = {
  unbilledMonths: {
    client: string
    clientSlug: string
    month: string
    unbilledHours: number
    value: string | null
    state: string
    invoice: string | null
  }[]
  unbilledDeliverables: {
    deliverableId: string
    client: string
    clientSlug: string
    project: string
    label: string
    title: string
    status: string
    fee: string
    dueOn: string | null
  }[]
  openInvoices: {
    number: string
    client: string
    status: string
    issuedOn: string
    amount: string
    daysSinceIssued: number
    href: string
  }[]
}

/** What is owed, what could be billed, and what is out — the chat's list_billing. */
export async function billingOverview(clientSlug?: string): Promise<BillingOverview> {
  const client = clientSlug ? await db.query.clients.findFirst({ where: eq(clients.slug, clientSlug) }) : null
  if (clientSlug && !client) throw new Error(`No client with slug "${clientSlug}". Call list_clients.`)

  const [sheets, done, open, invoiced] = await Promise.all([
    listSheets(),
    db.query.deliverables.findMany({
      where: inArray(deliverables.status, ["done", "pending"]),
      with: { project: { with: { client: true } } },
    }),
    db.query.invoices.findMany({
      where: and(inArray(invoices.status, ["draft", "sent"]), client ? eq(invoices.clientId, client.id) : undefined),
      with: { client: true },
      orderBy: [desc(invoices.issuedOn)],
    }),
    db.select({ deliverableId: invoices.deliverableId }).from(invoices),
  ])
  const billedDeliverables = new Set(invoiced.map((i) => i.deliverableId).filter(Boolean))
  const today = Date.now()

  return {
    unbilledMonths: sheets
      .filter((s) => s.unbilledHours > 0 && (!client || s.clientId === client.id))
      .map((s) => ({
        client: s.clientName,
        clientSlug: s.clientSlug,
        month: s.month,
        unbilledHours: s.unbilledHours,
        value: s.valueCents != null ? formatMoneyRaw(Math.round((s.valueCents * s.unbilledHours) / Math.max(s.hours, 0.01))) : null,
        state: s.state,
        invoice: s.invoiceNumber,
      })),
    unbilledDeliverables: done
      .filter((d) => (d.feeCents ?? 0) > 0 && !billedDeliverables.has(d.id) && d.project && (!client || d.project.clientId === client.id))
      // A finished deliverable is billable now; a pending one is shown so the chat can say what is coming.
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "done" ? -1 : 1))
      .map((d) => ({
        deliverableId: d.id,
        client: d.project!.client.name,
        clientSlug: d.project!.client.slug,
        project: d.project!.name,
        label: d.label,
        title: d.title,
        status: d.status === "done" ? "done — billable" : "pending",
        fee: formatMoneyRaw(d.feeCents ?? 0),
        dueOn: d.dueOn,
      })),
    openInvoices: open.map((i) => ({
      number: i.number,
      client: i.client.name,
      status: i.status,
      issuedOn: i.issuedOn,
      amount: formatMoneyRaw(i.amountCents, i.currency),
      daysSinceIssued: Math.max(0, Math.floor((today - new Date(`${i.issuedOn}T12:00:00Z`).getTime()) / 86_400_000)),
      href: ROUTES.invoice(i.number),
    })),
  }
}

/* ------------------------------------------------------------ hours */

export type MonthDraftInput = { clientSlug: string; month: string; hours?: number }

export type MonthDraftPlan = {
  kind: "hours"
  number: string
  clientId: string
  clientName: string
  retainerId: string
  month: string
  issuedOn: string
  entryIds: string[]
  loggedHours: number
  billHours: number
  rateCents: number
  amountCents: number
  billTo: string
  description: string
  notes: string
  /** Set when this client-month already has its draft — confirming returns it. */
  existing: { number: string; status: string } | null
  warnings: string[]
}

export async function planMonthDraft(input: MonthDraftInput): Promise<DraftResult<MonthDraftPlan>> {
  if (!/^\d{4}-\d{2}$/.test(input.month)) return { ok: false, error: "`month` must be YYYY-MM." }
  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, input.clientSlug),
    with: { retainers: true },
  })
  if (!client) return { ok: false, error: `No client with slug "${input.clientSlug}". Call list_clients.` }
  const retainer = client.retainers.find((r) => r.status === "active") ?? client.retainers[0] ?? null
  if (!retainer) return { ok: false, error: `${client.name} has no retainer, so there is no hourly rate. Bill a deliverable instead, or set up the retainer.` }

  const all = (await db.query.invoices.findMany()) as InvoiceRow[]
  const own = all.filter((i) => i.clientId === client.id).sort((a, b) => (a.issuedOn < b.issuedOn ? 1 : -1))
  const rateCents = retainerRateCents(retainer, all as Invoice[])
  if (!rateCents) return { ok: false, error: "Set an hourly rate on the retainer first." }

  const number =
    nextInSequence(own.filter((i) => i.retainerId).map((i) => i.number), /^(\d{3})-([A-Z])$/, 1, (n, m) => `${String(n).padStart(3, "0")}-${m[2]}`) ??
    invoiceNumberFor(client.slug, input.month)

  // One hours invoice per client-month: an earlier draft for this month wins.
  const sameMonth = own.find((i) => i.retainerId && !i.deliverableId && i.issuedOn.slice(0, 7) === input.month)
  const warnings: string[] = []

  const { start, end } = monthBounds(input.month)
  const entries = await db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.clientId, client.id),
      gte(timeEntries.occurredOn, start),
      lt(timeEntries.occurredOn, end),
      isNull(timeEntries.invoiceId)
    ),
    columns: { id: true, hours: true },
  })
  const loggedHours = sumHours(entries.map((e) => e.hours))
  const billHours = Math.round((input.hours ?? loggedHours) * 100) / 100

  const plan: MonthDraftPlan = {
    kind: "hours",
    number,
    clientId: client.id,
    clientName: client.name,
    retainerId: retainer.id,
    month: input.month,
    issuedOn: monthEnd(input.month),
    entryIds: entries.map((e) => e.id),
    loggedHours,
    billHours,
    rateCents,
    amountCents: Math.round(billHours * rateCents),
    billTo: billToFor(client.name, own),
    description: `${monthLong(input.month)} hours`,
    notes: `1099. ${Number(hoursToString(billHours))} hr at ${formatMoneyRaw(rateCents)}/hr.`,
    existing: sameMonth ? { number: sameMonth.number, status: sameMonth.status } : null,
    warnings,
  }
  // The card then shows the invoice that already exists, not a would-be one.
  if (sameMonth) {
    const hours = Number(sameMonth.hours ?? 0)
    return {
      ok: true,
      data: { ...plan, number: sameMonth.number, issuedOn: sameMonth.issuedOn, billHours: hours, loggedHours: hours, entryIds: [], amountCents: sameMonth.amountCents },
    }
  }

  if (!(billHours > 0)) return { ok: false, error: `No unbilled hours for ${client.name} in ${monthLong(input.month)}.` }
  if (all.some((i) => i.number === number)) return { ok: false, error: `${number} already exists on another invoice. Draft it on the invoices page and pick the number there.` }

  // Flat retainers (Mineralife, Zemvelo) bill the same hours every month; say
  // so when the logged hours would bill something else.
  const recent = own.filter((i) => i.retainerId === retainer.id && i.hours).slice(0, 3)
  if (recent.length === 3 && recent.every((i) => Number(i.hours) === retainer.hoursPerMonth) && input.hours == null && billHours !== retainer.hoursPerMonth) {
    warnings.push(`The last three invoices billed a flat ${retainer.hoursPerMonth} h; this bills the ${loggedHours} h logged. Send hours: ${retainer.hoursPerMonth} to match.`)
  }
  if (input.hours != null && input.hours !== loggedHours) {
    warnings.push(`Bills ${billHours} h against ${loggedHours} h logged.`)
  }
  if (input.month >= occurredOnIn(new Date(), await workspaceTimezone()).slice(0, 7)) {
    warnings.push("This month is not over — hours logged after today will not be on it.")
  }
  return { ok: true, data: plan }
}

/* ------------------------------------------------------------ deliverable */

export type DeliverableDraftPlan = {
  kind: "deliverable"
  number: string
  clientId: string
  clientName: string
  projectId: string
  projectName: string
  deliverableId: string
  issuedOn: string
  amountCents: number
  billTo: string
  description: string
  notes: string
  existing: { number: string; status: string } | null
  warnings: string[]
}

export async function planDeliverableDraft(deliverableId: string): Promise<DraftResult<DeliverableDraftPlan>> {
  if (!/^[0-9a-f-]{36}$/i.test(deliverableId)) return { ok: false, error: "`deliverableId` comes from list_billing." }
  const deliverable = await db.query.deliverables.findFirst({
    where: eq(deliverables.id, deliverableId),
    with: { project: { with: { client: true } } },
  })
  if (!deliverable?.project) return { ok: false, error: "No deliverable with that id. Call list_billing." }
  if (!((deliverable.feeCents ?? 0) > 0)) return { ok: false, error: "That deliverable has no fee to bill." }
  const client = deliverable.project.client

  const own = (await db.query.invoices.findMany({ where: eq(invoices.clientId, client.id) })) as InvoiceRow[]
  own.sort((a, b) => (a.issuedOn < b.issuedOn ? 1 : -1))
  const already = own.find((i) => i.deliverableId === deliverable.id)
  const prefix = client.slug.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const number =
    already?.number ??
    nextInSequence(own.filter((i) => !i.retainerId).map((i) => i.number), /^([A-Z0-9]+)-(\d{3})$/, 2, (n, m) => `${m[1]}-${String(n).padStart(3, "0")}`) ??
    `${prefix}-${deliverable.label.replace(/\s+/g, "")}`

  const warnings: string[] = []
  if (!already) {
    const taken = await db.query.invoices.findFirst({ where: eq(invoices.number, number), columns: { id: true } })
    if (taken) return { ok: false, error: `${number} already exists. Draft it on the project page and pick the number there.` }
    if (deliverable.status === "pending") warnings.push(`${deliverable.label} is still marked pending, not done.`)
    if (deliverable.status === "invoiced" || deliverable.status === "paid") warnings.push(`${deliverable.label} is already marked ${deliverable.status}, but no invoice points at it.`)
  }

  return {
    ok: true,
    data: {
      kind: "deliverable",
      number,
      clientId: client.id,
      clientName: client.name,
      projectId: deliverable.projectId,
      projectName: deliverable.project.name,
      deliverableId: deliverable.id,
      issuedOn: occurredOnIn(new Date(), await workspaceTimezone()),
      amountCents: deliverable.feeCents ?? 0,
      billTo: billToFor(client.name, own),
      description: `${deliverable.label} — ${deliverable.title || deliverable.label}`,
      notes: "Drafted from chat. Review number and description before sending.",
      existing: already ? { number: already.number, status: already.status } : null,
      warnings,
    },
  }
}

/* ------------------------------------------------------------ write */

export type DraftWritten = { number: string; status: string; amount: string; href: string; alreadyDrafted: boolean; linkedLines: number }

export async function writeDraft(plan: MonthDraftPlan | DeliverableDraftPlan): Promise<DraftResult<DraftWritten>> {
  const written = (alreadyDrafted: boolean, number: string, status: string, amountCents: number, linkedLines: number) => ({
    ok: true as const,
    data: { number, status, amount: formatMoneyRaw(amountCents), href: ROUTES.invoice(number), alreadyDrafted, linkedLines },
  })
  if (plan.existing) {
    const row = await db.query.invoices.findFirst({ where: eq(invoices.number, plan.existing.number) })
    return written(true, plan.existing.number, row?.status ?? plan.existing.status, row?.amountCents ?? plan.amountCents, 0)
  }

  try {
    let linked = 0
    await db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(invoices)
        .values(
          plan.kind === "hours"
            ? {
                number: plan.number,
                clientId: plan.clientId,
                retainerId: plan.retainerId,
                issuedOn: plan.issuedOn,
                amountCents: plan.amountCents,
                hours: hoursToString(plan.billHours),
                status: "draft",
                billTo: plan.billTo,
                description: plan.description,
                notes: plan.notes,
              }
            : {
                number: plan.number,
                clientId: plan.clientId,
                projectId: plan.projectId,
                deliverableId: plan.deliverableId,
                issuedOn: plan.issuedOn,
                amountCents: plan.amountCents,
                status: "draft",
                billTo: plan.billTo,
                description: plan.description,
                notes: plan.notes,
              }
        )
        .returning({ id: invoices.id })
      if (plan.kind === "hours" && plan.entryIds.length) {
        const rows = await tx
          .update(timeEntries)
          .set({ invoiceId: invoice.id })
          .where(and(inArray(timeEntries.id, plan.entryIds), isNull(timeEntries.invoiceId)))
          .returning({ id: timeEntries.id })
        linked = rows.length
      }
    })
    return written(false, plan.number, "draft", plan.amountCents, linked)
  } catch (error) {
    // The same card confirmed twice at once: the number's unique index held.
    if ((error as { code?: string }).code === "23505") {
      const row = await db.query.invoices.findFirst({ where: eq(invoices.number, plan.number) })
      if (row && row.clientId === plan.clientId) return written(true, row.number, row.status, row.amountCents, 0)
    }
    throw error
  }
}
