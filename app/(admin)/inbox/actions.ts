"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { clients, inboxMail, inboxState, supportTickets } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { INBOX_KINDS, type InboxKind } from "@/lib/inbox"
import { ROUTES } from "@/lib/nav"
import { createTask } from "@/lib/task-actions"

/**
 * The four verbs the triage bar offers, plus the two conversions mail needs.
 *
 * Every write is keyed on `(refKind, refId)` rather than a foreign key,
 * because the stream is a union over five tables and triage state must not
 * care which one an item came from.
 */

type Result = { ok: true } | { ok: false; error: string }

function touch() {
  revalidatePath(ROUTES.inbox)
  revalidatePath(ROUTES.home)
}

function splitKey(key: string): { kind: InboxKind; id: string } | null {
  const idx = key.indexOf(":")
  if (idx === -1) return null
  const kind = key.slice(0, idx)
  const id = key.slice(idx + 1)
  if (!id || !(INBOX_KINDS as readonly string[]).includes(kind)) return null
  return { kind: kind as InboxKind, id }
}

async function setState(
  key: string,
  state: "read" | "snoozed" | "archived",
  snoozedUntil: Date | null
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const parts = splitKey(key)
  if (!parts) return { ok: false, error: "Unknown item." }

  await db
    .insert(inboxState)
    .values({ refKind: parts.kind, refId: parts.id, state, snoozedUntil })
    .onConflictDoUpdate({
      target: [inboxState.refKind, inboxState.refId],
      set: { state, snoozedUntil, updatedAt: new Date() },
    })
  touch()
  return { ok: true }
}

export async function markReadAction(key: string) {
  return setState(key, "read", null)
}

export async function archiveAction(key: string) {
  return setState(key, "archived", null)
}

/** Back to unread — deleting the row is what "unread" means. */
export async function unarchiveAction(key: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const parts = splitKey(key)
  if (!parts) return { ok: false, error: "Unknown item." }
  await db
    .delete(inboxState)
    .where(and(eq(inboxState.refKind, parts.kind), eq(inboxState.refId, parts.id)))
  touch()
  return { ok: true }
}

const SNOOZE_DAYS: Record<string, number> = { tomorrow: 1, week: 7, fortnight: 14 }

export async function snoozeAction(key: string, span: string): Promise<Result> {
  const days = SNOOZE_DAYS[span]
  if (!days) return { ok: false, error: "Unknown snooze." }
  const until = new Date()
  until.setDate(until.getDate() + days)
  until.setHours(8, 0, 0, 0)
  return setState(key, "snoozed", until)
}

/** Assign a client to a piece of mail or an unassigned ticket. */
export async function assignClientAction(key: string, clientId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const parts = splitKey(key)
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
    revalidatePath(ROUTES.support)
  } else {
    return { ok: false, error: "That item has no client to set." }
  }
  touch()
  return { ok: true }
}

export async function makeTaskAction(
  key: string,
  title: string,
  clientId: string | null
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const parts = splitKey(key)
  if (!parts) return { ok: false, error: "Unknown item." }
  const trimmed = title.trim().slice(0, 300)
  if (!trimmed) return { ok: false, error: "A task needs a title." }

  const result = await createTask({
    title: trimmed,
    clientId,
    source: "inbox",
    refKind: parts.kind,
    refId: parts.id,
  })
  if (!result.ok) return { ok: false, error: result.error ?? "Could not create the task." }

  revalidatePath(ROUTES.tasks)
  touch()
  return { ok: true }
}

/**
 * Turn a piece of mail into a support ticket. The mail keeps the link, so it
 * leaves the stream rather than being deleted — the thread is still readable
 * from the ticket, and Fastmail still has the original.
 */
export async function mailToTicketAction(mailId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const mail = await db.query.inboxMail.findFirst({
    where: (m, { eq: e }) => e(m.id, mailId),
  })
  if (!mail) return { ok: false, error: "That mail is gone." }
  if (mail.ticketId) return { ok: false, error: "Already a ticket." }

  const [ticket] = await db
    .insert(supportTickets)
    .values({
      source: "email",
      externalId: mail.messageId,
      title: mail.subject || "(no subject)",
      description: mail.body,
      clientId: mail.clientId,
      submittedBy: mail.fromName || mail.fromEmail,
      contactEmail: mail.fromEmail,
      state: "open",
      priority: "normal",
      kind: "question",
      submittedOn: mail.receivedAt.toISOString().slice(0, 10),
    })
    .returning()
  if (!ticket) return { ok: false, error: "Could not open a ticket." }

  await db.update(inboxMail).set({ ticketId: ticket.id }).where(eq(inboxMail.id, mailId))
  revalidatePath(ROUTES.support)
  touch()
  return { ok: true }
}
