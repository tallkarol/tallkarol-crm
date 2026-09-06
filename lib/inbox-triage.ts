import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { clients, inboxMail, inboxState, supportTickets } from "@/db/schema"
import { INBOX_KINDS, type InboxKind } from "@/lib/inbox"
import { ticketFromMail } from "@/lib/inbox-mail"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"

/**
 * Inbox verbs without a cookie.
 *
 * The page's server actions auth then call these. Chat tools have a userId
 * already and must not go through `getSessionUser()`.
 */

export type TriageResult = { ok: true } | { ok: false; error: string }

export function splitInboxKey(key: string): { kind: InboxKind; id: string } | null {
  const idx = key.indexOf(":")
  if (idx === -1) return null
  const kind = key.slice(0, idx)
  const id = key.slice(idx + 1)
  if (!id || !(INBOX_KINDS as readonly string[]).includes(kind)) return null
  return { kind: kind as InboxKind, id }
}

export async function setInboxItemState(
  key: string,
  state: "read" | "snoozed" | "archived",
  snoozedUntil: Date | null
): Promise<TriageResult> {
  const parts = splitInboxKey(key)
  if (!parts) return { ok: false, error: "Unknown item." }

  await db
    .insert(inboxState)
    .values({ refKind: parts.kind, refId: parts.id, state, snoozedUntil })
    .onConflictDoUpdate({
      target: [inboxState.refKind, inboxState.refId],
      set: { state, snoozedUntil, updatedAt: new Date() },
    })
  return { ok: true }
}

export async function clearInboxItemState(key: string): Promise<TriageResult> {
  const parts = splitInboxKey(key)
  if (!parts) return { ok: false, error: "Unknown item." }
  await db
    .delete(inboxState)
    .where(and(eq(inboxState.refKind, parts.kind), eq(inboxState.refId, parts.id)))
  return { ok: true }
}

export const SNOOZE_DAYS: Record<string, number> = { tomorrow: 1, week: 7, fortnight: 14 }

export async function snoozeInboxItem(key: string, span: string): Promise<TriageResult> {
  const days = SNOOZE_DAYS[span]
  if (!days) return { ok: false, error: "Unknown snooze." }
  const until = new Date()
  until.setDate(until.getDate() + days)
  until.setHours(8, 0, 0, 0)
  return setInboxItemState(key, "snoozed", until)
}

export async function assignInboxClient(key: string, clientId: string): Promise<TriageResult> {
  const parts = splitInboxKey(key)
  if (!parts) return { ok: false, error: "Unknown item." }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return { ok: false, error: "No such client." }

  if (parts.kind === "mail") {
    await db.update(inboxMail).set({ clientId }).where(eq(inboxMail.id, parts.id))
  } else if (parts.kind === "ticket") {
    await db
      .update(supportTickets)
      .set({ clientId, updatedAt: new Date() })
      .where(eq(supportTickets.id, parts.id))
  } else {
    return { ok: false, error: "That item has no client to set." }
  }
  return { ok: true }
}

export async function makeInboxTask(input: {
  key: string
  title: string
  clientId: string | null
  userId: string
}): Promise<TriageResult & { taskId?: string }> {
  const parts = splitInboxKey(input.key)
  if (!parts) return { ok: false, error: "Unknown item." }
  const title = input.title.trim().slice(0, 300)
  if (!title) return { ok: false, error: "A task needs a title." }

  const target = await resolveTaskTarget({ clientId: input.clientId })
  if ("error" in target) return { ok: false, error: target.error }

  const id = await insertTaskRow(db, {
    title,
    userId: input.userId,
    target,
    source: "inbox",
    refKind: parts.kind,
    refId: parts.id,
  })
  return { ok: true, taskId: id }
}

export async function mailToTicketById(mailId: string): Promise<TriageResult & { ticket?: string }> {
  const mail = await db.query.inboxMail.findFirst({
    where: (m, { eq: e }) => e(m.id, mailId),
  })
  if (!mail) return { ok: false, error: "That mail is gone." }

  const result = await ticketFromMail(mail)
  if (!result.ok) return { ok: false, error: result.error }
  if (!result.created) return { ok: false, error: result.reason }
  return { ok: true, ticket: result.ticket.number }
}
