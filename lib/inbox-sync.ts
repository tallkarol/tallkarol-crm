import { eq, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import { appSettings, clients, inboxMail } from "@/db/schema"
import { DEFAULT_TICKET_ALIASES, shouldAutoTicket, ticketFromMail } from "@/lib/inbox-mail"
import {
  fetchMailById,
  fetchRecentMail,
  jmapConfig,
  jmapSession,
  listMailboxes,
  matchLiveMail,
  resolveClient,
  resolveMailboxId,
  type JmapConfig,
  type JmapEmail,
} from "@/lib/jmap"

/**
 * The one implementation of peeking and syncing agent@.
 *
 * The CLI (`scripts/inbox.ts`) and the chat tools both call this, so a dry
 * run in chat cannot describe a different set of messages than `inbox:sync
 * --dry`. Nothing here sends, deletes, or flags mail — JMAP is read-only.
 */

const SETTING_KEY = "inbox_mail_sync"

export type InboxSyncSetting = {
  lastSyncAt?: string
  mailbox?: string
  aliasMap?: Record<string, string>
  ticketAliases?: string[]
}

export async function readInboxSyncSetting(): Promise<InboxSyncSetting> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SETTING_KEY))
    .limit(1)
  const value = row?.value
  return value && typeof value === "object" ? (value as InboxSyncSetting) : {}
}

export async function writeInboxSyncSetting(next: InboxSyncSetting) {
  await db
    .insert(appSettings)
    .values({ key: SETTING_KEY, value: next })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedAt: new Date() },
    })
}

function agentConfig(): JmapConfig | null {
  return jmapConfig()
}

export type MailboxFolder = {
  name: string
  total: number
  id: string
  selected: boolean
}

export type MailboxCheck = {
  configured: boolean
  accountId?: string
  lastSyncAt: string | null
  mailbox: string | null
  aliasMap: Record<string, string>
  ticketAliases: string[]
  folders: MailboxFolder[]
  warning?: string
  error?: string
}

export async function checkAgentMailbox(): Promise<MailboxCheck> {
  const config = agentConfig()
  const setting = await readInboxSyncSetting()
  const base = {
    lastSyncAt: setting.lastSyncAt ?? null,
    mailbox: setting.mailbox ?? null,
    aliasMap: setting.aliasMap ?? {},
    ticketAliases: setting.ticketAliases ?? DEFAULT_TICKET_ALIASES,
    folders: [] as MailboxFolder[],
  }
  if (!config) {
    return {
      configured: false,
      ...base,
      error: "AGENT_FASTMAIL_TOKEN is not set. The CRM cannot see agent@.",
    }
  }

  try {
    const session = await jmapSession(config)
    const boxes = await listMailboxes(config)
    const selectedId = setting.mailbox ? resolveMailboxId(boxes, setting.mailbox) : null
    return {
      configured: true,
      accountId: session.accountId,
      ...base,
      folders: boxes.map((box) => ({
        name: box.name,
        total: box.total,
        id: box.id,
        selected: selectedId === box.id,
      })),
      warning:
        setting.mailbox && !selectedId
          ? `configured folder "${setting.mailbox}" matches nothing in the account`
          : undefined,
    }
  } catch (err) {
    return {
      configured: true,
      ...base,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export type PeekHeader = {
  /** JMAP id — pass this to `readAgentMail` / `read_mail` for the body. */
  id: string
  subject: string
  from: string
  to: string
  deliveredTo: string
  originalTo: string
  snippet: string
  receivedAt: string
}

export type PeekResult = {
  configured: boolean
  lastSyncAt: string | null
  mailbox: string | null
  messages: PeekHeader[]
  error?: string
}

async function liveMailbox(config: JmapConfig) {
  const setting = await readInboxSyncSetting()
  let mailboxId: string | undefined
  if (setting.mailbox) {
    const boxes = await listMailboxes(config)
    mailboxId = resolveMailboxId(boxes, setting.mailbox) ?? undefined
  }
  return { setting, mailboxId }
}

function peekRow(m: JmapEmail): PeekHeader {
  return {
    id: m.id,
    subject: m.subject,
    from: m.fromEmail,
    to: m.toEmail,
    deliveredTo: m.deliveredTo,
    originalTo: m.originalTo,
    snippet: m.snippet,
    receivedAt: m.receivedAt,
  }
}

/** Live headers from agent@. Writes nothing. Body stays on a follow-up read. */
export async function peekAgentMailbox(limit = 10): Promise<PeekResult> {
  const config = agentConfig()
  const setting = await readInboxSyncSetting()
  if (!config) {
    return {
      configured: false,
      lastSyncAt: setting.lastSyncAt ?? null,
      mailbox: setting.mailbox ?? null,
      messages: [],
      error: "AGENT_FASTMAIL_TOKEN is not set. The CRM cannot see agent@.",
    }
  }

  try {
    const live = await liveMailbox(config)
    const mail = await fetchRecentMail(config, {
      limit: Math.min(Math.max(limit, 1), 25),
      mailbox: live.mailboxId,
      bodies: false,
    })
    return {
      configured: true,
      lastSyncAt: live.setting.lastSyncAt ?? null,
      mailbox: live.setting.mailbox ?? null,
      messages: mail.map(peekRow),
    }
  } catch (err) {
    return {
      configured: true,
      lastSyncAt: setting.lastSyncAt ?? null,
      mailbox: setting.mailbox ?? null,
      messages: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export type AgentMail = {
  id: string
  messageId: string
  from: { name: string; email: string }
  to: string
  deliveredTo: string
  originalTo: string
  subject: string
  snippet: string
  body: string
  receivedAt: string
}

export type ReadAgentMailResult = {
  configured: boolean
  source: "agent" | null
  mail: AgentMail | null
  /** Other live matches when subject/from is ambiguous. */
  matches: PeekHeader[]
  error?: string
}

function toAgentMail(m: JmapEmail): AgentMail {
  return {
    id: m.id,
    messageId: m.messageId,
    from: { name: m.fromName, email: m.fromEmail },
    to: m.toEmail,
    deliveredTo: m.deliveredTo,
    originalTo: m.originalTo,
    subject: m.subject,
    snippet: m.snippet,
    body: m.body,
    receivedAt: m.receivedAt,
  }
}

/**
 * One live message from agent@, body included. Writes nothing.
 *
 * Prefer the JMAP id from a peek. Subject / from are a contains match against
 * the newest 25 when the id is missing or not found.
 */
export async function readAgentMail(opts: {
  id?: string
  subject?: string
  from?: string
}): Promise<ReadAgentMailResult> {
  const config = agentConfig()
  const empty: ReadAgentMailResult = {
    configured: Boolean(config),
    source: null,
    mail: null,
    matches: [],
  }
  if (!config) {
    return {
      ...empty,
      error: "AGENT_FASTMAIL_TOKEN is not set. The CRM cannot see agent@.",
    }
  }
  if (!opts.id && !opts.subject && !opts.from) {
    return { ...empty, error: "Pass a mail id (from peek) or a subject." }
  }

  try {
    const live = await liveMailbox(config)
    if (opts.id) {
      const direct = await fetchMailById(config, opts.id)
      if (direct) return { configured: true, source: "agent", mail: toAgentMail(direct), matches: [] }
    }

    const recent = await fetchRecentMail(config, {
      limit: 25,
      mailbox: live.mailboxId,
      bodies: true,
    })
    const { hit, others } = matchLiveMail(recent, opts)
    if (hit) {
      return {
        configured: true,
        source: "agent",
        mail: toAgentMail(hit),
        matches: others.map(peekRow),
      }
    }
    return {
      configured: true,
      source: null,
      mail: null,
      matches: [],
      error: "No matching message in the newest 25 on agent@.",
    }
  } catch (err) {
    return {
      configured: true,
      source: null,
      mail: null,
      matches: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export type SyncPlanRow = {
  subject: string
  fromEmail: string
  toEmail: string
  deliveredTo: string
  originalTo: string
  receivedAt: string
  clientSlug: string | null
  via: "alias" | "sender" | null
  autoTicket: boolean
  alreadyStored: boolean
}

export type SyncPlan = {
  configured: boolean
  since: string | null
  fetched: number
  newCount: number
  wouldTicket: number
  rows: SyncPlanRow[]
  error?: string
}

async function clientRows() {
  return db.select({ id: clients.id, slug: clients.slug, domains: clients.domains }).from(clients)
}

async function collectMail(opts: { all?: boolean; limit?: number }) {
  const config = agentConfig()
  const setting = await readInboxSyncSetting()
  if (!config) {
    return {
      ok: false as const,
      setting,
      error: "AGENT_FASTMAIL_TOKEN is not set. The CRM cannot see agent@.",
    }
  }

  let mailboxId: string | undefined
  if (setting.mailbox) {
    const boxes = await listMailboxes(config)
    const resolved = resolveMailboxId(boxes, setting.mailbox)
    if (!resolved) {
      return {
        ok: false as const,
        setting,
        error: `configured folder "${setting.mailbox}" does not exist`,
      }
    }
    mailboxId = resolved
  }

  const sinceIso = opts.all ? null : (setting.lastSyncAt ?? null)
  const mail = await fetchRecentMail(config, {
    limit: opts.limit ?? 50,
    sinceIso,
    mailbox: mailboxId,
  })
  return { ok: true as const, setting, sinceIso, mail }
}

export async function planInboxSync(opts: { all?: boolean } = {}): Promise<SyncPlan> {
  try {
    const collected = await collectMail(opts)
    if (!collected.ok) {
      return {
        configured: Boolean(agentConfig()),
        since: collected.setting.lastSyncAt ?? null,
        fetched: 0,
        newCount: 0,
        wouldTicket: 0,
        rows: [],
        error: collected.error,
      }
    }

    const { setting, sinceIso, mail } = collected
    const roster = await clientRows()
    const aliasMap = setting.aliasMap ?? {}
    const ticketAliases = setting.ticketAliases ?? DEFAULT_TICKET_ALIASES
    const existing = new Set<string>()
    if (mail.length) {
      const found = await db
        .select({ messageId: inboxMail.messageId })
        .from(inboxMail)
        .where(
          inArray(
            inboxMail.messageId,
            mail.map((m) => m.messageId)
          )
        )
      for (const row of found) existing.add(row.messageId)
    }

    const rows: SyncPlanRow[] = mail.map((message) => {
      const { clientId, via } = resolveClient(message, roster, aliasMap)
      const recipients = [message.toEmail, message.deliveredTo, message.originalTo].filter(Boolean)
      return {
        subject: message.subject,
        fromEmail: message.fromEmail,
        toEmail: message.toEmail,
        deliveredTo: message.deliveredTo,
        originalTo: message.originalTo,
        receivedAt: message.receivedAt,
        clientSlug: clientId ? (roster.find((c) => c.id === clientId)?.slug ?? null) : null,
        via,
        autoTicket: shouldAutoTicket(recipients, ticketAliases),
        alreadyStored: existing.has(message.messageId),
      }
    })

    return {
      configured: true,
      since: sinceIso,
      fetched: mail.length,
      newCount: rows.filter((r) => !r.alreadyStored).length,
      wouldTicket: rows.filter((r) => !r.alreadyStored && r.autoTicket).length,
      rows,
    }
  } catch (err) {
    const setting = await readInboxSyncSetting()
    return {
      configured: Boolean(agentConfig()),
      since: setting.lastSyncAt ?? null,
      fetched: 0,
      newCount: 0,
      wouldTicket: 0,
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export type SyncResult = {
  configured: boolean
  fetched?: number
  added: number
  ticketed: number
  total: number
  rows: { subject: string; clientSlug: string | null; ticket?: string; error?: string }[]
  error?: string
}

export async function runInboxSync(opts: { all?: boolean } = {}): Promise<SyncResult> {
  const collected = await collectMail(opts)
  if (!collected.ok) {
    return {
      configured: Boolean(agentConfig()),
      added: 0,
      ticketed: 0,
      total: 0,
      rows: [],
      error: collected.error,
    }
  }

  const { setting, mail } = collected
  const roster = await clientRows()
  const aliasMap = setting.aliasMap ?? {}
  const ticketAliases = setting.ticketAliases ?? DEFAULT_TICKET_ALIASES

  let added = 0
  let ticketed = 0
  const rows: SyncResult["rows"] = []

  for (const message of mail) {
    const { clientId, via } = resolveClient(message, roster, aliasMap)
    const clientSlug = clientId ? (roster.find((c) => c.id === clientId)?.slug ?? null) : null
    const recipients = [message.toEmail, message.deliveredTo, message.originalTo].filter(Boolean)
    const autoTicket = shouldAutoTicket(recipients, ticketAliases)

    const [inserted] = await db
      .insert(inboxMail)
      .values({
        messageId: message.messageId,
        threadId: message.threadId,
        inReplyTo: message.inReplyTo,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        toEmail: message.deliveredTo || message.originalTo || message.toEmail,
        subject: message.subject,
        snippet: message.snippet,
        body: message.body.slice(0, 100_000),
        clientId,
        receivedAt: new Date(message.receivedAt),
      })
      .onConflictDoNothing({ target: inboxMail.messageId })
      .returning()
    if (!inserted) continue

    added += 1
    let ticket: string | undefined
    let error: string | undefined
    if (autoTicket) {
      const result = await ticketFromMail(inserted)
      if (result.ok && result.created) {
        ticketed += 1
        ticket = result.ticket.number
      } else if (!result.ok) {
        error = result.error
      }
    }
    rows.push({
      subject: message.subject,
      clientSlug: clientSlug ? `${clientSlug} (via ${via})` : null,
      ticket,
      error,
    })
  }

  const newest = mail.reduce<string | null>(
    (latest, m) => (latest == null || m.receivedAt > latest ? m.receivedAt : latest),
    null
  )
  if (newest) await writeInboxSyncSetting({ ...setting, lastSyncAt: newest })

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(inboxMail)
  return { configured: true, fetched: mail.length, added, ticketed, total: count, rows }
}
