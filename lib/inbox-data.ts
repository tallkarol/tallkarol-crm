import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { clients, inboxMail, inboxState } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { readLead } from "@/lib/lead"
import { ROUTES } from "@/lib/nav"
import { ticketNumber, ticketPriority, ticketState } from "@/lib/support"
import type { InboxData, InboxItem, InboxItemState, InboxKind, InboxLens } from "@/lib/inbox"
import { INBOX_KINDS, toSeverity } from "@/lib/inbox"

/**
 * The db half of the inbox — the union query itself.
 *
 * Kept apart from `lib/inbox.ts` because the console is a client component and
 * importing `db` from it pulls postgres into the browser bundle. Same split as
 * `lib/tasks.ts` versus `lib/task-view.ts`.
 */

function days(from: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000))
}

/** First non-empty line, flattened — enough for one row of the stream. */
function snippetOf(text: string, max = 160) {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export async function loadInbox(now = new Date()): Promise<InboxData> {
  let ready = true

  const [inquiries, tickets, messages, mail, events, states, clientRows] = await Promise.all([
    db.query.inquiries.findMany({ orderBy: (i) => [desc(i.createdAt)] }).catch(() => []),
    db.query.supportTickets
      .findMany({
        with: { client: { columns: { slug: true, name: true } } },
        orderBy: (t) => [desc(t.createdAt)],
        limit: 300,
      })
      .catch(() => []),
    db.query.ticketMessages
      .findMany({ orderBy: (m) => [desc(m.sentAt)], limit: 300 })
      .catch(() => []),
    db.query.inboxMail
      .findMany({
        where: isNull(inboxMail.ticketId),
        with: { client: { columns: { slug: true, name: true } } },
        orderBy: (m) => [desc(m.receivedAt)],
        limit: 300,
      })
      .catch(() => {
        ready = false
        return []
      }),
    db.query.appEvents
      .findMany({
        with: { client: { columns: { slug: true, name: true } } },
        orderBy: (e) => [desc(e.occurredAt)],
        limit: 200,
      })
      .catch(() => []),
    db
      .select()
      .from(inboxState)
      .catch(() => {
        ready = false
        return []
      }),
    db.query.clients
      .findMany({ columns: { id: true, slug: true, name: true }, orderBy: (c, { asc }) => [asc(c.name)] })
      .catch(() => []),
  ])

  const stateByKey = new Map(states.map((s) => [`${s.refKind}:${s.refId}`, s]))

  function resolveState(key: string): InboxItemState {
    const row = stateByKey.get(key)
    if (!row) return "unread"
    if (row.state === "archived") return "archived"
    if (row.state === "snoozed") {
      // A snooze that has run out is simply unread again.
      if (row.snoozedUntil && row.snoozedUntil <= now) return "unread"
      return "snoozed"
    }
    return "read"
  }

  const items: InboxItem[] = []
  const ticketById = new Map(tickets.map((t) => [t.id, t]))

  for (const row of inquiries) {
    const lead = readLead(row.payload)
    const key = `lead:${row.id}`
    items.push({
      key,
      kind: "lead",
      id: row.id,
      title: row.name,
      snippet: [row.company, row.projectTypes.join(", "), row.email]
        .filter(Boolean)
        .join(" · "),
      actor: row.email,
      clientSlug: null,
      clientName: null,
      color: "#006965",
      occurredAt: row.createdAt.toISOString(),
      ageDays: days(row.createdAt, now),
      state: resolveState(key),
      needsReply: lead.qualification === "unreviewed" && row.status !== "closed",
      priority: null,
      severity: "info",
      href: `${ROUTES.leads}?lead=${row.id}`,
    })
  }

  for (const t of tickets) {
    if (ticketState(t) === "closed") continue
    const key = `ticket:${t.id}`
    const opened = t.submittedOn ? new Date(`${t.submittedOn}T00:00:00`) : t.createdAt
    items.push({
      key,
      kind: "ticket",
      id: t.id,
      title: t.title || ticketNumber(t),
      snippet: [t.client?.name, t.submittedBy, t.platform, snippetOf(t.description, 90)]
        .filter(Boolean)
        .join(" · "),
      actor: t.submittedBy || t.contactEmail,
      clientSlug: t.client?.slug ?? null,
      clientName: t.client?.name ?? null,
      color: t.client ? clientColor(t.client.slug) : "rgba(15,22,21,.22)",
      occurredAt: opened.toISOString(),
      ageDays: days(opened, now),
      state: resolveState(key),
      needsReply: t.firstResponseAt == null,
      priority: ticketPriority(t.priority),
      severity: "info",
      href: `${ROUTES.support}/${ticketNumber(t)}`,
    })
  }

  // A client's reply on an existing ticket is its own arrival, not the ticket.
  for (const m of messages) {
    if (m.role !== "client") continue
    const ticket = ticketById.get(m.ticketId)
    if (!ticket || ticketState(ticket) === "closed") continue
    const key = `message:${m.id}`
    items.push({
      key,
      kind: "message",
      id: m.id,
      title: `Re: ${ticket.title || ticketNumber(ticket)}`,
      snippet: snippetOf(m.body, 120),
      actor: m.author || m.authorEmail,
      clientSlug: ticket.client?.slug ?? null,
      clientName: ticket.client?.name ?? null,
      color: ticket.client ? clientColor(ticket.client.slug) : "rgba(15,22,21,.22)",
      occurredAt: m.sentAt.toISOString(),
      ageDays: days(m.sentAt, now),
      state: resolveState(key),
      needsReply: true,
      priority: ticketPriority(ticket.priority),
      severity: "info",
      href: `${ROUTES.support}/${ticketNumber(ticket)}`,
    })
  }

  for (const m of mail) {
    const key = `mail:${m.id}`
    items.push({
      key,
      kind: "mail",
      id: m.id,
      title: m.subject || "(no subject)",
      snippet: m.snippet || snippetOf(m.body, 120),
      actor: m.fromName || m.fromEmail,
      clientSlug: m.client?.slug ?? null,
      clientName: m.client?.name ?? null,
      color: m.client ? clientColor(m.client.slug) : "rgba(15,22,21,.22)",
      occurredAt: m.receivedAt.toISOString(),
      ageDays: days(m.receivedAt, now),
      state: resolveState(key),
      needsReply: true,
      priority: null,
      severity: "info",
      href: null,
    })
  }

  for (const e of events) {
    const key = `event:${e.id}`
    items.push({
      key,
      kind: "event",
      id: e.id,
      title: e.summary || e.kind,
      snippet: [e.kind, e.actor, e.count > 1 ? `×${e.count}` : null].filter(Boolean).join(" · "),
      actor: e.actor,
      clientSlug: e.client?.slug ?? null,
      clientName: e.client?.name ?? null,
      color: e.client ? clientColor(e.client.slug) : "rgba(15,22,21,.22)",
      occurredAt: e.occurredAt.toISOString(),
      ageDays: days(e.occurredAt, now),
      state: resolveState(key),
      needsReply: false,
      priority: null,
      severity: toSeverity(e.severity),
      href: null,
    })
  }

  items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))

  const live = items.filter((i) => i.state !== "archived")
  const counts = {
    unread: live.filter((i) => i.state === "unread").length,
    reply: live.filter((i) => i.needsReply && i.state !== "snoozed").length,
    snoozed: live.filter((i) => i.state === "snoozed").length,
    all: live.length,
    archive: items.filter((i) => i.state === "archived").length,
    byKind: Object.fromEntries(
      INBOX_KINDS.map((k) => [k, live.filter((i) => i.kind === k).length])
    ) as Record<InboxKind, number>,
  }

  const clients = clientRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    color: clientColor(c.slug),
  }))

  return { items, counts, clients, ready }
}

export async function loadInboxMail(id: string) {
  const mail = await db.query.inboxMail.findFirst({
    where: eq(inboxMail.id, id),
    with: { client: { columns: { slug: true, name: true } } },
  })
  if (!mail) return null
  return {
    id: mail.id,
    messageId: mail.messageId,
    from: { name: mail.fromName, email: mail.fromEmail },
    to: mail.toEmail,
    subject: mail.subject,
    snippet: mail.snippet,
    body: mail.body,
    receivedAt: mail.receivedAt.toISOString(),
    client: mail.client ? { slug: mail.client.slug, name: mail.client.name } : null,
    ticketId: mail.ticketId,
  }
}

export async function searchInboxMail(
  q: string,
  opts: { clientSlug?: string; limit?: number } = {}
) {
  const needle = `%${q.replace(/[%_]/g, "\\$&")}%`
  const limit = Math.min(opts.limit ?? 25, 50)

  const rows = await db
    .select({
      id: inboxMail.id,
      subject: inboxMail.subject,
      snippet: inboxMail.snippet,
      fromName: inboxMail.fromName,
      fromEmail: inboxMail.fromEmail,
      toEmail: inboxMail.toEmail,
      receivedAt: inboxMail.receivedAt,
      ticketId: inboxMail.ticketId,
      clientSlug: clients.slug,
      clientName: clients.name,
    })
    .from(inboxMail)
    .leftJoin(clients, eq(clients.id, inboxMail.clientId))
    .where(
      and(
        sql`(
          ${inboxMail.subject} ilike ${needle} escape '\\'
          or ${inboxMail.snippet} ilike ${needle} escape '\\'
          or ${inboxMail.body} ilike ${needle} escape '\\'
          or ${inboxMail.fromEmail} ilike ${needle} escape '\\'
          or ${inboxMail.fromName} ilike ${needle} escape '\\'
          or ${inboxMail.toEmail} ilike ${needle} escape '\\'
        )`,
        opts.clientSlug ? eq(clients.slug, opts.clientSlug) : undefined
      )
    )
    .orderBy(desc(inboxMail.receivedAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    key: `mail:${row.id}`,
    subject: row.subject,
    snippet: row.snippet,
    from: row.fromName || row.fromEmail,
    fromEmail: row.fromEmail,
    to: row.toEmail,
    receivedAt: row.receivedAt.toISOString(),
    client: row.clientSlug ? { slug: row.clientSlug, name: row.clientName } : null,
    ticketId: row.ticketId,
  }))
}
