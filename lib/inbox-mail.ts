import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients, inboxMail, type InboxMail, type SupportTicket } from "@/db/schema"
import { localPartOf } from "@/lib/jmap"
import { createTicket } from "@/lib/tickets"

/**
 * Turning inbound mail into a support ticket — the one implementation.
 *
 * Both doors use it: the sync, when mail arrives at an alias configured to
 * open tickets automatically, and the Make-ticket button in the inbox. They
 * used to differ, and the manual one inserted straight into `support_tickets`,
 * which skipped `nextTicketNumber()` and minted tickets with no number at all.
 */

export type TicketFromMail =
  | { ok: true; ticket: SupportTicket; created: true }
  | { ok: true; ticket: null; created: false; reason: string }
  | { ok: false; error: string }

export async function ticketFromMail(mail: InboxMail): Promise<TicketFromMail> {
  if (mail.ticketId) {
    return { ok: true, ticket: null, created: false, reason: "Already a ticket." }
  }

  // Numbering is per client (ZEM-0001, GDI-0004), so the slug has to come along.
  let clientSlug: string | null = null
  if (mail.clientId) {
    const [row] = await db
      .select({ slug: clients.slug })
      .from(clients)
      .where(eq(clients.id, mail.clientId))
      .limit(1)
    clientSlug = row?.slug ?? null
  }

  const ticket = await createTicket({
    source: "email",
    // The RFC message id keeps a re-sync from opening a second ticket.
    externalId: mail.messageId,
    clientId: mail.clientId,
    clientSlug,
    title: mail.subject || "(no subject)",
    description: mail.body,
    kind: "question",
    priority: "normal",
    state: "open",
    submittedBy: mail.fromName || mail.fromEmail,
    contactEmail: mail.fromEmail,
    raw: {
      via: "email",
      toEmail: mail.toEmail,
      messageId: mail.messageId,
      threadId: mail.threadId,
    },
  })

  // Linking the mail is what removes it from the untriaged stream.
  await db.update(inboxMail).set({ ticketId: ticket.id }).where(eq(inboxMail.id, mail.id))

  return { ok: true, ticket, created: true }
}

/**
 * Aliases that open a ticket the moment mail arrives, rather than waiting to
 * be triaged by hand. `support@` is the obvious one — mail sent there is a
 * request by definition, so making someone press a button first adds nothing.
 */
export const DEFAULT_TICKET_ALIASES = ["support"]

export function shouldAutoTicket(recipients: string[], ticketAliases: string[]) {
  const wanted = new Set(ticketAliases.map((a) => localPartOf(a)).filter(Boolean))
  if (wanted.size === 0) return false
  return recipients.some((r) => wanted.has(localPartOf(r)))
}
