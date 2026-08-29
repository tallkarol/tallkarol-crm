import { desc, eq, ne, sql } from "drizzle-orm"
import type { QueueInitial } from "@/components/support/TicketQueue"
import type { QueueRow } from "@/components/support/types"
import { db } from "@/db"
import {
  monitorRuns,
  supportTickets,
  ticketAttachments,
  ticketMessages,
  ticketPayloads,
} from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import {
  DEFAULT_STATE,
  STATE_FILTER_IDS,
  STATE_LABEL,
  TICKET_SORTS,
  ageLabel,
  isLate,
  ticketNumber,
  ticketOpenedAt,
  ticketPriority,
  ticketSlug,
  ticketState,
} from "@/lib/support"
import { formatDay } from "@/lib/work"

/** Newest few hundred is every ticket we've ever had, with room to spare. */
const QUEUE_LIMIT = 500

export type QueueData = {
  rows: QueueRow[]
  platforms: string[]
  bySlug: Map<string, string>
}

export async function loadQueue(): Promise<QueueData> {
  const [tickets, payloadIndex, messageCounts] = await Promise.all([
    db.query.supportTickets.findMany({
      with: { client: { columns: { slug: true, name: true } } },
      orderBy: (t) => [desc(t.submittedOn), desc(t.createdAt)],
      limit: QUEUE_LIMIT,
    }),
    db
      .select({
        ticketId: ticketPayloads.ticketId,
        label: ticketPayloads.label,
        snippet: sql<string>`left(${ticketPayloads.body}, 400)`,
      })
      .from(ticketPayloads),
    db
      .select({
        ticketId: ticketMessages.ticketId,
        count: sql<number>`count(*)::int`,
        body: sql<string>`string_agg(left(${ticketMessages.body}, 300), ' ')`,
      })
      .from(ticketMessages)
      .groupBy(ticketMessages.ticketId),
  ])

  const payloadsByTicket = new Map<string, { count: number; text: string }>()
  for (const p of payloadIndex) {
    const entry = payloadsByTicket.get(p.ticketId) ?? { count: 0, text: "" }
    entry.count++
    entry.text += ` ${p.label} ${p.snippet}`
    payloadsByTicket.set(p.ticketId, entry)
  }
  const messagesByTicket = new Map(messageCounts.map((m) => [m.ticketId, m]))

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const rows: QueueRow[] = tickets.map((t) => {
    const state = ticketState(t)
    const payloadInfo = payloadsByTicket.get(t.id)
    const messageInfo = messagesByTicket.get(t.id)
    const dueSoon = Boolean(
      t.dueOn && new Date(`${t.dueOn}T23:59:59`) <= today && state !== "closed"
    )
    const search = [
      ticketNumber(t),
      t.title,
      t.description,
      t.resolution,
      t.client?.name ?? "unassigned",
      t.platform,
      t.source,
      t.submittedBy,
      t.contactEmail,
      t.tags.join(" "),
      payloadInfo?.text ?? "",
      messageInfo?.body ?? "",
    ]
      .join(" ")
      .toLowerCase()

    return {
      id: t.id,
      slug: ticketSlug(t),
      number: ticketNumber(t),
      title: t.title,
      clientSlug: t.client?.slug ?? "unassigned",
      clientName: t.client?.name ?? "Unassigned",
      color: t.client ? clientColor(t.client.slug) : "rgba(15,22,21,.22)",
      platform: t.platform,
      source: t.source,
      state,
      stateLabel: STATE_LABEL[state],
      priority: ticketPriority(t.priority),
      tags: t.tags,
      age: ageLabel(ticketOpenedAt(t), now),
      openedAt: ticketOpenedAt(t).getTime(),
      dueAt: t.dueOn ? new Date(`${t.dueOn}T23:59:59`).getTime() : null,
      late: isLate(t, now),
      dueSoon,
      dueLabel: t.dueOn ? `Due ${formatDay(t.dueOn)}` : "",
      payloadCount: payloadInfo?.count ?? 0,
      messageCount: messageInfo?.count ?? 0,
      submittedBy: t.submittedBy,
      search,
    }
  })

  const platforms = Array.from(new Set(rows.map((r) => r.platform).filter(Boolean))).sort()
  const bySlug = new Map(rows.map((r) => [r.slug, r.id]))
  return { rows, platforms, bySlug }
}

export async function loadTicket(id: string) {
  const ticket = await db.query.supportTickets.findFirst({
    where: eq(supportTickets.id, id),
    with: { client: { columns: { slug: true, name: true } } },
  })
  if (!ticket) return null

  const [messages, payloads, attachments, triggeredBy] = await Promise.all([
    db.query.ticketMessages.findMany({
      where: eq(ticketMessages.ticketId, id),
      orderBy: (m, { asc }) => [asc(m.sentAt)],
    }),
    db.query.ticketPayloads.findMany({
      where: eq(ticketPayloads.ticketId, id),
      orderBy: (p, { asc }) => [asc(p.position), asc(p.createdAt)],
    }),
    db.query.ticketAttachments.findMany({
      where: eq(ticketAttachments.ticketId, id),
      // The bytes stay on the server; the page links to them.
      columns: { id: true, name: true, mime: true, bytes: true, createdAt: true },
      orderBy: (a, { asc }) => [asc(a.createdAt)],
    }),
    db.query.monitorRuns.findMany({
      where: eq(monitorRuns.ticketId, id),
      with: { monitor: { columns: { slug: true, name: true, scheduleNote: true } } },
      orderBy: (r, { desc: d }) => [d(r.startedAt)],
      limit: 5,
    }),
  ])

  const related = ticket.clientId
    ? await db.query.supportTickets.findMany({
        where: (t, { and }) => and(eq(t.clientId, ticket.clientId!), ne(t.id, id)),
        with: { client: { columns: { slug: true, name: true } } },
        orderBy: (t) => [desc(t.submittedOn), desc(t.createdAt)],
        limit: 6,
      })
    : []

  return { ticket, messages, payloads, attachments, triggeredBy, related }
}

/* ------------------------------------------------------------ url params */

export type SearchParams = Record<string, string | string[] | undefined>

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

function many(value: string | string[] | undefined) {
  return one(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
}

/** The filters are the URL — this reads them back on a cold load or a share. */
export function parseQueueParams(searchParams: SearchParams): QueueInitial {
  const state = one(searchParams.state)
  const group = one(searchParams.group)
  const view = one(searchParams.view)
  const sort = one(searchParams.sort)
  return {
    q: one(searchParams.q),
    clients: many(searchParams.client),
    platforms: many(searchParams.platform),
    state: (STATE_FILTER_IDS as readonly string[]).includes(state)
      ? (state as QueueInitial["state"])
      : DEFAULT_STATE,
    group: ["client", "platform", "priority"].includes(group)
      ? (group as QueueInitial["group"])
      : "none",
    sort: (TICKET_SORTS as readonly string[]).includes(sort)
      ? (sort as QueueInitial["sort"])
      : "priority",
    density: one(searchParams.density) === "tight" ? "tight" : "comfy",
    view: ["mine", "urgent", "waiting", "code"].includes(view)
      ? (view as QueueInitial["view"])
      : null,
  }
}

/** Same params, back as a string, so every link keeps the current view. */
export function queueQueryString(searchParams: SearchParams) {
  const p = new URLSearchParams()
  for (const key of ["q", "client", "platform", "state", "group", "sort", "density", "view"]) {
    const value = one(searchParams[key])
    if (value) p.set(key, value)
  }
  return p.toString()
}
