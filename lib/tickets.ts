import { desc, eq, like } from "drizzle-orm"
import { db } from "@/db"
import {
  supportTickets,
  ticketMessages,
  ticketPayloads,
  type SupportTicket,
} from "@/db/schema"
import { clientPrefix, countLines, normalizeLang } from "@/lib/support"

/**
 * Everything that opens a ticket goes through here — the ingest endpoint, the
 * monitor engine, and whatever files them next. One numbering scheme, one
 * shape, one place to change when tickets learn something new.
 */

export const MAX_PAYLOAD_BYTES = 256 * 1024
export const MAX_PAYLOADS = 12

/** ZEM-0007 — per client, so numbers stay legible across brands. */
export async function nextTicketNumber(clientSlug: string | null) {
  const prefix = clientSlug ? clientPrefix(clientSlug) : "TK"
  const [last] = await db
    .select({ number: supportTickets.number })
    .from(supportTickets)
    .where(like(supportTickets.number, `${prefix}-%`))
    .orderBy(desc(supportTickets.number))
    .limit(1)
  const current = last ? Number(last.number.slice(prefix.length + 1)) : 0
  const next = Number.isFinite(current) ? current + 1 : 1
  return `${prefix}-${String(next).padStart(4, "0")}`
}

export type PayloadInput = { label?: string; lang?: string | null; body: string }

export async function attachPayloads(ticketId: string, payloads: PayloadInput[]) {
  const rows = payloads
    .slice(0, MAX_PAYLOADS)
    .map((p, i) => {
      const body = (p.body ?? "").slice(0, MAX_PAYLOAD_BYTES)
      if (!body) return null
      return {
        ticketId,
        label: (p.label || `Payload ${i + 1}`).slice(0, 120),
        lang: normalizeLang(p.lang ?? null, body),
        body,
        lines: countLines(body),
        bytes: Buffer.byteLength(body, "utf8"),
        position: i,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
  if (!rows.length) return 0
  await db.insert(ticketPayloads).values(rows)
  return rows.length
}

export async function appendMessage(input: {
  ticketId: string
  role: "client" | "me" | "bot" | "system"
  author: string
  body: string
  authorEmail?: string
  sentAt?: Date
}) {
  await db.insert(ticketMessages).values({
    ticketId: input.ticketId,
    role: input.role,
    author: input.author.slice(0, 200),
    authorEmail: (input.authorEmail ?? "").slice(0, 200).toLowerCase(),
    body: input.body,
    sentAt: input.sentAt ?? new Date(),
  })
}

export type NewTicket = {
  source: string
  externalId: string
  clientId: string | null
  clientSlug: string | null
  sourceId?: string | null
  title: string
  description?: string
  kind?: "incident" | "request" | "question"
  priority?: string
  state?: string
  platform?: string
  submittedBy?: string
  contactEmail?: string
  tags?: string[]
  raw?: Record<string, unknown>
  dueOn?: string | null
}

export async function createTicket(input: NewTicket): Promise<SupportTicket> {
  const now = new Date()
  const state = input.state ?? "open"
  const [row] = await db
    .insert(supportTickets)
    .values({
      source: input.source,
      externalId: input.externalId,
      number: await nextTicketNumber(input.clientSlug),
      title: input.title.slice(0, 300),
      kind: input.kind ?? "incident",
      status: state,
      state,
      priority: input.priority ?? "normal",
      platform: (input.platform ?? "").slice(0, 60),
      submittedBy: (input.submittedBy ?? "").slice(0, 200),
      contactEmail: (input.contactEmail ?? "").slice(0, 200).toLowerCase(),
      description: (input.description ?? "").slice(0, 20000),
      tags: input.tags ?? [],
      clientId: input.clientId,
      sourceId: input.sourceId ?? null,
      completed: state === "closed",
      raw: input.raw ?? {},
      submittedOn: now.toISOString().slice(0, 10),
      dueOn: input.dueOn ?? null,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .returning()
  return row
}

export async function setTicketPriority(ticketId: string, priority: string) {
  await db
    .update(supportTickets)
    .set({ priority, updatedAt: new Date() })
    .where(eq(supportTickets.id, ticketId))
}

export async function addTicketTags(ticket: SupportTicket, tags: string[]) {
  const next = Array.from(new Set([...ticket.tags, ...tags])).slice(0, 8)
  if (next.length === ticket.tags.length) return
  await db
    .update(supportTickets)
    .set({ tags: next, updatedAt: new Date() })
    .where(eq(supportTickets.id, ticket.id))
}
