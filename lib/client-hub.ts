import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  calendarEvents,
  clients,
  invoices,
  portalGrants,
  reports,
  sites,
  supportTickets,
  tasks,
  ticketMessages,
  timeEntries,
} from "@/db/schema"
import type {
  CalendarAttendee,
  Client,
  ClientStatus,
  Contract,
  Deliverable,
  Invoice,
  NotionLink,
  Product,
  Project,
  Proposal,
  Report,
  Retainer,
  Site,
  TimeEntry,
  Worksheet,
} from "@/db/schema"
import { ATTENTION_RULES } from "@/lib/attention"
import { clientColor } from "@/lib/client-colors"
import { isOpenState, ticketPriority, ticketState } from "@/lib/support"
import type { TicketState } from "@/lib/support"
import { currentMonth, monthBounds, shiftMonth } from "@/lib/timesheet"

/**
 * Everything the client hub pages need, assembled server-side.
 *
 * The roster (index) and the hub (detail) read the same signals — hours against
 * the retainer ceiling, unpaid money, open tasks, the next meeting, tickets —
 * so both loaders live here and share the derivations.
 */

/** A sent invoice this old is money you should be chasing, not waiting on. */
export const UNPAID_INVOICE_FLAG_DAYS = 14

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function daysSinceDay(iso: string, now: Date) {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return 0
  const then = new Date(y, m - 1, d)
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000))
}

function ticketAgeDays(
  t: { submittedOn: string | null; createdAt: Date },
  now: Date
) {
  const opened = t.submittedOn ? new Date(`${t.submittedOn}T00:00:00`) : t.createdAt
  return Math.max(0, Math.floor((now.getTime() - opened.getTime()) / 86_400_000))
}

/* ------------------------------------------------------------------ roster */

export type RosterRow = {
  id: string
  name: string
  slug: string
  color: string
  status: ClientStatus
  /** "Retainer 20 hr/mo · 2 projects · 1 product" */
  engagement: string
  tags: ("retainer" | "project" | "product" | "dormant")[]
  /** null = nothing to meter (no active retainer). */
  hours: { logged: number; cap: number } | null
  hoursNote: string
  openTasks: number
  overdueTasks: number
  /** Open tickets past their reply window. */
  ticketsWaiting: number
  nextMeeting: { startsAt: string; title: string } | null
  outstandingCents: number
  /** Days since the oldest unpaid invoice was sent. */
  outstandingAgeDays: number | null
  dormant: boolean
  lastActivity: string | null
}

export type RosterData = {
  rows: RosterRow[]
  totals: { clients: number; retainerHours: number; outstandingCents: number }
}

export async function loadClientRoster(now = new Date()): Promise<RosterData> {
  const month = currentMonth(now)
  const { start: monthStart } = monthBounds(month)
  const today = isoDay(now)

  const [clientRows, taskRows, sentInvoices, ticketRows, meetingRows, entrySums, lastEntries] =
    await Promise.all([
      db.query.clients.findMany({
        orderBy: [asc(clients.name)],
        with: { retainers: true, projects: true, products: true },
      }),
      db
        .select({ clientId: tasks.clientId, dueOn: tasks.dueOn })
        .from(tasks)
        .where(and(eq(tasks.status, "open"), isNotNull(tasks.clientId))),
      db
        .select({
          clientId: invoices.clientId,
          number: invoices.number,
          issuedOn: invoices.issuedOn,
          amountCents: invoices.amountCents,
        })
        .from(invoices)
        .where(eq(invoices.status, "sent")),
      db
        .select({
          clientId: supportTickets.clientId,
          title: supportTickets.title,
          state: supportTickets.state,
          status: supportTickets.status,
          completed: supportTickets.completed,
          priority: supportTickets.priority,
          firstResponseAt: supportTickets.firstResponseAt,
          submittedOn: supportTickets.submittedOn,
          createdAt: supportTickets.createdAt,
        })
        .from(supportTickets)
        .where(isNotNull(supportTickets.clientId)),
      db
        .select({
          clientId: calendarEvents.clientId,
          title: calendarEvents.title,
          startsAt: calendarEvents.startsAt,
        })
        .from(calendarEvents)
        .where(
          and(
            isNotNull(calendarEvents.clientId),
            eq(calendarEvents.cancelled, false),
            gte(calendarEvents.startsAt, now)
          )
        )
        .orderBy(asc(calendarEvents.startsAt)),
      db
        .select({
          clientId: timeEntries.clientId,
          hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)`,
        })
        .from(timeEntries)
        .where(gte(timeEntries.occurredOn, monthStart))
        .groupBy(timeEntries.clientId),
      db
        .select({
          clientId: timeEntries.clientId,
          last: sql<string>`max(${timeEntries.occurredOn})`,
        })
        .from(timeEntries)
        .groupBy(timeEntries.clientId),
    ])

  const hoursByClient = new Map(entrySums.map((r) => [r.clientId, Number(r.hours)]))
  const lastByClient = new Map(lastEntries.map((r) => [r.clientId, r.last]))

  const tasksByClient = new Map<string, { open: number; overdue: number }>()
  for (const t of taskRows) {
    if (!t.clientId) continue
    const bucket = tasksByClient.get(t.clientId) ?? { open: 0, overdue: 0 }
    bucket.open += 1
    if (t.dueOn && t.dueOn < today) bucket.overdue += 1
    tasksByClient.set(t.clientId, bucket)
  }

  const invoicesByClient = new Map<string, typeof sentInvoices>()
  for (const i of sentInvoices) {
    const list = invoicesByClient.get(i.clientId) ?? []
    list.push(i)
    invoicesByClient.set(i.clientId, list)
  }

  const waitingByClient = new Map<string, { count: number; oldest: (typeof ticketRows)[number] | null }>()
  for (const t of ticketRows) {
    if (!t.clientId) continue
    if (!isOpenState(ticketState(t))) continue
    const age = ticketAgeDays(t, now)
    const late = !t.firstResponseAt && age >= ATTENTION_RULES.ticketReplyDays[ticketPriority(t.priority)]
    if (!late) continue
    const bucket = waitingByClient.get(t.clientId) ?? { count: 0, oldest: null }
    bucket.count += 1
    if (!bucket.oldest || ticketAgeDays(bucket.oldest, now) < age) bucket.oldest = t
    waitingByClient.set(t.clientId, bucket)
  }

  const nextMeetingByClient = new Map<string, { startsAt: string; title: string }>()
  for (const m of meetingRows) {
    if (!m.clientId || nextMeetingByClient.has(m.clientId)) continue
    nextMeetingByClient.set(m.clientId, {
      startsAt: m.startsAt.toISOString(),
      title: m.title,
    })
  }

  const rows: RosterRow[] = clientRows.map((client) => {
    const activeRetainers = client.retainers.filter((r) => r.status === "active")
    const cap = activeRetainers.reduce((sum, r) => sum + r.hoursPerMonth, 0)
    const activeProjects = client.projects.filter((p) => p.status !== "complete")
    const liveProducts = client.products.filter(
      (p) => p.status === "building" || p.status === "live"
    )
    const logged = hoursByClient.get(client.id) ?? 0

    const tags: RosterRow["tags"] = []
    if (activeRetainers.length > 0) tags.push("retainer")
    if (activeProjects.length > 0) tags.push("project")
    if (liveProducts.length > 0) tags.push("product")
    // No attached work is not the same as done talking — in contact, a
    // proposal, or internal work should still read as live on the roster.
    const noWork = tags.length === 0
    const dormant =
      noWork &&
      (client.status === "completed_work" || client.status === "lapsed_retainer")
    if (dormant) tags.push("dormant")

    const last = lastByClient.get(client.id) ?? null
    const lastActivity =
      last == null
        ? null
        : new Date(`${last}T00:00:00`).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })

    const engagementParts = dormant
      ? [
          client.projects.length > 0 ? "projects done" : "no active work",
          lastActivity ? `last activity ${lastActivity}` : null,
        ]
      : [
          cap > 0 ? `Retainer ${cap} hr/mo` : null,
          activeProjects.length > 0
            ? `${activeProjects.length} project${activeProjects.length === 1 ? "" : "s"}`
            : null,
          liveProducts.length > 0
            ? `${liveProducts.length} product${liveProducts.length === 1 ? "" : "s"}`
            : null,
          noWork && lastActivity ? `last activity ${lastActivity}` : null,
        ]

    const unpaid = invoicesByClient.get(client.id) ?? []
    const outstandingCents = unpaid.reduce((sum, i) => sum + i.amountCents, 0)
    const oldest = unpaid.reduce<(typeof unpaid)[number] | null>(
      (acc, i) => (!acc || i.issuedOn < acc.issuedOn ? i : acc),
      null
    )
    const outstandingAgeDays = oldest ? daysSinceDay(oldest.issuedOn, now) : null

    const taskBucket = tasksByClient.get(client.id) ?? { open: 0, overdue: 0 }
    const waiting = waitingByClient.get(client.id)

    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      color: clientColor(client.slug),
      status: client.status,
      engagement: engagementParts.filter(Boolean).join(" · "),
      tags,
      hours: cap > 0 ? { logged, cap } : null,
      hoursNote:
        cap > 0 ? "" : activeProjects.length > 0 ? "project-billed" : dormant ? "" : "no retainer",
      openTasks: taskBucket.open,
      overdueTasks: taskBucket.overdue,
      ticketsWaiting: waiting?.count ?? 0,
      nextMeeting: nextMeetingByClient.get(client.id) ?? null,
      outstandingCents,
      outstandingAgeDays,
      dormant,
      lastActivity,
    }
  })

  // Working clients first, dormant last; alphabetical within each group.
  rows.sort((a, b) =>
    a.dormant === b.dormant ? a.name.localeCompare(b.name) : a.dormant ? 1 : -1
  )
  return {
    rows,
    totals: {
      clients: rows.length,
      retainerHours: rows.reduce((sum, r) => sum + (r.hours?.cap ?? 0), 0),
      outstandingCents: rows.reduce((sum, r) => sum + r.outstandingCents, 0),
    },
  }
}

/* -------------------------------------------------------------------- hub */

export type HubMeeting = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string
  url: string
  attendees: CalendarAttendee[]
  /** Hours already logged against this event (past meetings). */
  loggedHours: number
}

export type HubTicket = {
  id: string
  number: string
  title: string
  state: TicketState
  priority: string
  submittedBy: string
  source: string
  openedAt: Date
  ageDays: number
  /** Days without a first reply, when it is on us. */
  waitingOnYouDays: number | null
  snippet: string
}

export type ActivityItem = {
  key: string
  kind: "time" | "task" | "invoice" | "ticket" | "meeting"
  title: string
  sub: string
  at: Date
  /** Quiet items came from a machine (sync, portal), not from you. */
  quiet: boolean
}

export type RetainerBurn = {
  retainer: Retainer
  monthHours: number
  history: { month: string; label: string; hours: number }[]
}

export type ClientHub = {
  client: Client & {
    retainers: Retainer[]
    projects: (Project & { deliverables: Deliverable[] })[]
    products: Product[]
    invoices: Invoice[]
    contracts: Contract[]
    reports: Report[]
    proposals: Proposal[]
    worksheets: Worksheet[]
    notionLinks: NotionLink[]
  }
  month: string
  monthHours: number
  monthCap: number
  outstandingCents: number
  outstandingNote: string | null
  billedYtdCents: number
  burns: RetainerBurn[]
  upcoming: HubMeeting[]
  recentMeetings: HubMeeting[]
  openTickets: HubTicket[]
  closedTicketCount: number
  sites: Site[]
  contacts: string[]
  activity: ActivityItem[]
  entries: TimeEntry[]
}

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

function fmtH(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "")
}

export async function loadClientHub(
  slug: string,
  now = new Date()
): Promise<ClientHub | null> {
  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    with: {
      retainers: true,
      projects: { with: { deliverables: true } },
      products: true,
      invoices: true,
      contracts: true,
      reports: true,
      proposals: true,
      worksheets: true,
      notionLinks: true,
    },
  })
  if (!client) return null

  const month = currentMonth(now)
  const historyStart = `${shiftMonth(month, -5)}-01`
  const pastWindow = new Date(now.getTime() - 45 * 86_400_000)

  const [entries, upcomingRows, pastRows, ticketRows, siteRows, grantRows] =
    await Promise.all([
      db.query.timeEntries.findMany({
        where: and(
          eq(timeEntries.clientId, client.id),
          gte(timeEntries.occurredOn, historyStart)
        ),
        orderBy: [desc(timeEntries.occurredOn), desc(timeEntries.createdAt)],
      }),
      db.query.calendarEvents.findMany({
        where: and(
          eq(calendarEvents.clientId, client.id),
          eq(calendarEvents.cancelled, false),
          gte(calendarEvents.startsAt, now)
        ),
        orderBy: [asc(calendarEvents.startsAt)],
        limit: 5,
      }),
      db.query.calendarEvents.findMany({
        where: and(
          eq(calendarEvents.clientId, client.id),
          eq(calendarEvents.cancelled, false),
          lt(calendarEvents.startsAt, now),
          gte(calendarEvents.startsAt, pastWindow)
        ),
        orderBy: [desc(calendarEvents.startsAt)],
        limit: 3,
      }),
      db.query.supportTickets.findMany({
        where: eq(supportTickets.clientId, client.id),
        orderBy: [desc(supportTickets.createdAt)],
      }),
      db.query.sites.findMany({
        where: eq(sites.clientId, client.id),
        orderBy: [asc(sites.sort)],
      }),
      db
        .select({ email: portalGrants.email })
        .from(portalGrants)
        .where(eq(portalGrants.clientId, client.id)),
    ])

  const { start: monthStart } = monthBounds(month)
  const monthEntries = entries.filter((e) => e.occurredOn >= monthStart)
  const monthHours = monthEntries.reduce((sum, e) => sum + Number(e.hours), 0)
  const activeRetainers = client.retainers.filter((r) => r.status === "active")
  const monthCap = activeRetainers.reduce((sum, r) => sum + r.hoursPerMonth, 0)

  const sent = client.invoices.filter((i) => i.status === "sent")
  const outstandingCents = sent.reduce((sum, i) => sum + i.amountCents, 0)
  const oldestSent = sent.reduce<Invoice | null>(
    (acc, i) => (!acc || i.issuedOn < acc.issuedOn ? i : acc),
    null
  )
  const outstandingNote = oldestSent
    ? `${oldestSent.number} unpaid ${daysSinceDay(oldestSent.issuedOn, now)} days`
    : null

  const year = String(now.getFullYear())
  const billedYtdCents = client.invoices
    .filter((i) => i.status !== "draft" && i.issuedOn.startsWith(year))
    .reduce((sum, i) => sum + i.amountCents, 0)

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5))
  const burns: RetainerBurn[] = client.retainers.map((retainer) => {
    const byMonth = new Map<string, number>()
    for (const e of entries) {
      if (e.retainerId !== retainer.id) continue
      const key = e.occurredOn.slice(0, 7)
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(e.hours))
    }
    return {
      retainer,
      monthHours: byMonth.get(month) ?? 0,
      history: months.map((m) => ({
        month: m,
        label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }),
        hours: byMonth.get(m) ?? 0,
      })),
    }
  })

  const loggedByEvent = new Map<string, number>()
  for (const e of entries) {
    if (!e.calendarEventId) continue
    loggedByEvent.set(
      e.calendarEventId,
      (loggedByEvent.get(e.calendarEventId) ?? 0) + Number(e.hours)
    )
  }
  const toMeeting = (row: (typeof upcomingRows)[number]): HubMeeting => ({
    id: row.id,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    allDay: row.allDay,
    location: row.location,
    url: row.url,
    attendees: row.attendees,
    loggedHours: loggedByEvent.get(row.id) ?? 0,
  })

  const messagesByTicket = new Map<string, string>()
  const openRows = ticketRows.filter((t) => isOpenState(ticketState(t)))
  if (openRows.length > 0) {
    const msgs = await db.query.ticketMessages.findMany({
      where: inArray(
        ticketMessages.ticketId,
        openRows.map((t) => t.id)
      ),
      orderBy: [desc(ticketMessages.sentAt)],
    })
    for (const m of msgs) {
      if (!messagesByTicket.has(m.ticketId)) messagesByTicket.set(m.ticketId, m.body)
    }
  }
  const openTickets: HubTicket[] = openRows.map((t) => {
    const ageDays = ticketAgeDays(t, now)
    const late =
      !t.firstResponseAt &&
      ageDays >= ATTENTION_RULES.ticketReplyDays[ticketPriority(t.priority)]
    return {
      id: t.id,
      number: t.number,
      title: t.title || "Untitled ticket",
      state: ticketState(t),
      priority: t.priority,
      submittedBy: t.submittedBy || t.customerContact || t.contactEmail,
      source: t.source,
      openedAt: t.submittedOn ? new Date(`${t.submittedOn}T00:00:00`) : t.createdAt,
      ageDays,
      waitingOnYouDays: late ? ageDays : null,
      snippet: (messagesByTicket.get(t.id) || t.description).slice(0, 200),
    }
  })

  /* ---- activity: the last things that happened on this client ---- */
  const activity: ActivityItem[] = []
  for (const e of entries.slice(0, 6)) {
    activity.push({
      key: `time:${e.id}`,
      kind: "time",
      title: `${fmtH(Number(e.hours))} hr logged`,
      sub: e.summary,
      at: new Date(`${e.occurredOn}T12:00:00`),
      quiet: false,
    })
  }
  for (const i of [...client.invoices]
    .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))
    .slice(0, 3)) {
    if (i.status === "draft") continue
    activity.push({
      key: `invoice:${i.id}`,
      kind: "invoice",
      title: `Invoice ${i.number} ${i.status === "paid" ? "paid" : "sent"}`,
      sub: money(i.amountCents),
      at: new Date(`${i.issuedOn}T12:00:00`),
      quiet: false,
    })
  }
  for (const t of ticketRows.slice(0, 3)) {
    activity.push({
      key: `ticket:${t.id}`,
      kind: "ticket",
      title: t.completed ? "Ticket resolved" : "Ticket opened",
      sub: t.title,
      at: t.createdAt,
      quiet: true,
    })
  }
  for (const m of pastRows) {
    activity.push({
      key: `meeting:${m.id}`,
      kind: "meeting",
      title: "Meeting held",
      sub: m.title,
      at: m.startsAt,
      quiet: true,
    })
  }
  activity.sort((a, b) => b.at.getTime() - a.at.getTime())

  const contacts = Array.from(new Set(grantRows.map((g) => g.email)))

  return {
    client,
    month,
    monthHours,
    monthCap,
    outstandingCents,
    outstandingNote,
    billedYtdCents,
    burns,
    upcoming: upcomingRows.map(toMeeting),
    recentMeetings: pastRows.map(toMeeting),
    openTickets,
    closedTicketCount: ticketRows.length - openRows.length,
    sites: siteRows,
    contacts,
    activity: activity.slice(0, 8),
    entries,
  }
}
