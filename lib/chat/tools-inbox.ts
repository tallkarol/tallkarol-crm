import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { loadInbox, loadInboxMail, searchInboxMail } from "@/lib/inbox-data"
import { isInboxLens, matchesLens, type InboxLens } from "@/lib/inbox"
import {
  assignInboxClient,
  mailToTicketById,
  makeInboxTask,
  setInboxItemState,
  snoozeInboxItem,
  splitInboxKey,
} from "@/lib/inbox-triage"
import {
  checkAgentMailbox,
  peekAgentMailbox,
  planInboxSync,
  readAgentMail,
  runInboxSync,
} from "@/lib/inbox-sync"
import { num, str, type ToolSpec } from "@/lib/chat/tool-helpers"

export const peekAgentMailboxTool: ToolSpec = {
  name: "peek_agent_mailbox",
  description:
    "Live headers from agent@tallkarol.com over JMAP. Use for 'what's in agent@', 'check the mailbox', 'any new mail'. Returns id + snippet for each message — pass the id to read_mail for the body. Writes nothing. Does not send.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number", description: "How many newest messages. Default 10, max 25." },
    },
  },
  async run(args) {
    const [check, peek] = await Promise.all([
      checkAgentMailbox(),
      peekAgentMailbox(num(args, "limit") ?? 10),
    ])
    return {
      configured: peek.configured,
      lastSyncAt: peek.lastSyncAt,
      mailbox: peek.mailbox ?? "(whole account)",
      ticketAliases: check.ticketAliases,
      folders: check.folders.map((f) => ({
        name: f.name,
        total: f.total,
        selected: f.selected,
      })),
      messages: peek.messages,
      warning: check.warning,
      error: peek.error ?? check.error,
    }
  },
}

export const listInboxTool: ToolSpec = {
  name: "list_inbox",
  description:
    "The CRM inbox stream: mail, tickets, leads, client replies, and events already synced. Use for unread, needs-reply, or 'what's in the inbox'. For live agent@ that may not be synced yet, peek_agent_mailbox then read_mail.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      lens: {
        type: "string",
        description: "unread | reply | snoozed | all | archive. Default unread.",
      },
      kind: {
        type: "string",
        description: "lead | ticket | message | mail | event. Omit for every kind.",
      },
      clientSlug: { type: "string" },
      limit: { type: "number", description: "Default 40, max 80." },
    },
  },
  async run(args) {
    const lens: InboxLens = isInboxLens(str(args, "lens")) ? (str(args, "lens") as InboxLens) : "unread"
    const kind = str(args, "kind")
    const clientSlug = str(args, "clientSlug")
    const limit = Math.min(num(args, "limit") ?? 40, 80)
    const data = await loadInbox()
    const items = data.items
      .filter((item) => matchesLens(item, lens))
      .filter((item) => !kind || item.kind === kind)
      .filter((item) => !clientSlug || item.clientSlug === clientSlug)
      .slice(0, limit)
      .map((item) => ({
        key: item.key,
        kind: item.kind,
        title: item.title,
        snippet: item.snippet,
        from: item.actor,
        client: item.clientSlug,
        state: item.state,
        needsReply: item.needsReply,
        at: item.occurredAt,
        href: item.href,
      }))
    return {
      ready: data.ready,
      lens,
      counts: data.counts,
      items,
      truncated: items.length === limit,
    }
  },
}

const CRM_MAIL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function clipBody(body: string) {
  return {
    body: body.length > 20_000 ? `${body.slice(0, 20_000)}…` : body,
    bodyTruncated: body.length > 20_000,
  }
}

export const readMailTool: ToolSpec = {
  name: "read_mail",
  description:
    "One message, body included. Pass a peek id, a subject, or a synced mail:<id>. Reads agent@ live over JMAP when the row is not in the CRM yet — do not ask Karol to sync just to read. Writes nothing. Does not send.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "JMAP id from peek_agent_mailbox, or a synced mail:<id>.",
      },
      subject: {
        type: "string",
        description: "Subject contains-match against the newest agent@ mail.",
      },
      from: {
        type: "string",
        description: "Sender contains-match, usually with subject.",
      },
    },
  },
  async run(args) {
    const raw = str(args, "id")
    const subject = str(args, "subject")
    const from = str(args, "from")
    if (!raw && !subject && !from) {
      return { error: "Pass a mail id (from peek) or a subject." }
    }

    const parts = raw ? splitInboxKey(raw) : null
    const id = parts?.kind === "mail" ? parts.id : raw
    if (id && CRM_MAIL_ID.test(id)) {
      const stored = await loadInboxMail(id)
      if (stored) return { source: "crm", ...stored, ...clipBody(stored.body) }
    }

    const live = await readAgentMail({ id, subject, from })
    if (live.mail) {
      return {
        source: "agent",
        ...live.mail,
        ...clipBody(live.mail.body),
        also: live.matches,
      }
    }
    return {
      error: live.error ?? "That mail is not on agent@ and not in the CRM.",
      matches: live.matches,
    }
  },
}

export const searchMailTool: ToolSpec = {
  name: "search_mail",
  description:
    "Search synced inbox_mail by subject, sender, recipient, or body. Not a live Fastmail search — only what has been synced.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      q: { type: "string" },
      clientSlug: { type: "string" },
    },
    required: ["q"],
  },
  async run(args) {
    const q = str(args, "q")
    if (!q) return { messages: [] }
    const messages = await searchInboxMail(q, { clientSlug: str(args, "clientSlug") })
    return { messages }
  },
}

export const syncInboxTool: ToolSpec = {
  name: "sync_inbox",
  description:
    "Pull new agent@ mail into the CRM. Previewed first: the card is a dry run of what would land and which support@ messages would open a ticket. Confirming writes inbox_mail. Never sends.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      all: {
        type: "boolean",
        description: "Ignore the watermark and re-read the last 50. Default false.",
      },
    },
  },
  async preview(args) {
    const plan = await planInboxSync({ all: args.all === true })
    const fresh = plan.rows.filter((r) => !r.alreadyStored)
    return {
      title: "Inbox sync preview",
      fields: [
        { label: "Since", value: plan.since ?? "never (or --all)" },
        { label: "Fetched", value: String(plan.fetched) },
        { label: "New", value: String(plan.newCount) },
        { label: "Would ticket", value: String(plan.wouldTicket) },
        {
          label: "New subjects",
          value: fresh.length
            ? fresh
                .slice(0, 8)
                .map((r) => `${r.subject.slice(0, 48)} → ${r.clientSlug ?? "unassigned"}`)
                .join("; ")
            : "none",
        },
      ],
      note: plan.error ?? (fresh.some((r) => r.autoTicket) ? "support@ rows open a ticket on arrival." : undefined),
    }
  },
  async run(args) {
    const result = await runInboxSync({ all: args.all === true })
    if (result.error) throw new Error(result.error)
    return result
  },
}

export const archiveInboxItemTool: ToolSpec = {
  name: "archive_inbox_item",
  description: "Archive one inbox item. Previewed. Key looks like mail:<id> or ticket:<id>.",
  mutating: true,
  parameters: {
    type: "object",
    properties: { key: { type: "string" } },
    required: ["key"],
  },
  async preview(args) {
    return {
      title: "Archive inbox item",
      fields: [{ label: "Item", value: str(args, "key") ?? "—" }],
    }
  },
  async run(args) {
    const key = str(args, "key")
    if (!key) throw new Error("`key` is required.")
    const result = await setInboxItemState(key, "archived", null)
    if (!result.ok) throw new Error(result.error)
    return { archived: key }
  },
}

export const snoozeInboxItemTool: ToolSpec = {
  name: "snooze_inbox_item",
  description: "Snooze one inbox item until tomorrow, a week, or a fortnight. Previewed.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      key: { type: "string" },
      span: { type: "string", description: "tomorrow | week | fortnight." },
    },
    required: ["key", "span"],
  },
  async preview(args) {
    return {
      title: "Snooze inbox item",
      fields: [
        { label: "Item", value: str(args, "key") ?? "—" },
        { label: "Until", value: str(args, "span") ?? "—" },
      ],
    }
  },
  async run(args) {
    const key = str(args, "key")
    const span = str(args, "span")
    if (!key || !span) throw new Error("`key` and `span` are required.")
    const result = await snoozeInboxItem(key, span)
    if (!result.ok) throw new Error(result.error)
    return { snoozed: key, span }
  },
}

export const assignInboxItemTool: ToolSpec = {
  name: "assign_inbox_item",
  description: "Assign a client to a piece of mail or an unassigned ticket. Previewed.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      key: { type: "string" },
      clientSlug: { type: "string" },
    },
    required: ["key", "clientSlug"],
  },
  async preview(args) {
    const slug = str(args, "clientSlug")
    const client = slug
      ? await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
      : null
    return {
      title: "Assign inbox item",
      fields: [
        { label: "Item", value: str(args, "key") ?? "—" },
        { label: "Client", value: client?.name ?? slug ?? "—" },
      ],
      note: client ? undefined : `No client matches "${slug ?? ""}".`,
    }
  },
  async run(args) {
    const key = str(args, "key")
    const slug = str(args, "clientSlug")
    if (!key || !slug) throw new Error("`key` and `clientSlug` are required.")
    const client = await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
    if (!client) throw new Error(`No client matches "${slug}".`)
    const result = await assignInboxClient(key, client.id)
    if (!result.ok) throw new Error(result.error)
    return { assigned: key, client: slug }
  },
}

export const inboxToTicketTool: ToolSpec = {
  name: "inbox_to_ticket",
  description:
    "Turn a synced mail row into a support ticket. Previewed. Only mail that is already in inbox_mail. support@ already auto-tickets on sync.",
  mutating: true,
  parameters: {
    type: "object",
    properties: { mailId: { type: "string", description: "Mail id or mail:<id>." } },
    required: ["mailId"],
  },
  async preview(args) {
    const raw = str(args, "mailId")
    const parts = raw ? splitInboxKey(raw) : null
    const id = parts?.kind === "mail" ? parts.id : raw
    const mail = id ? await loadInboxMail(id) : null
    return {
      title: "Make ticket from mail",
      fields: [
        { label: "Subject", value: mail?.subject ?? raw ?? "—" },
        { label: "From", value: mail?.from.email ?? "—" },
        { label: "Client", value: mail?.client?.name ?? "unassigned" },
      ],
      note: mail?.ticketId ? "Already a ticket." : undefined,
    }
  },
  async run(args) {
    const raw = str(args, "mailId")
    if (!raw) throw new Error("`mailId` is required.")
    const parts = splitInboxKey(raw)
    const id = parts?.kind === "mail" ? parts.id : raw
    const result = await mailToTicketById(id)
    if (!result.ok) throw new Error(result.error)
    return { ticket: result.ticket }
  },
}

export const inboxToTaskTool: ToolSpec = {
  name: "inbox_to_task",
  description: "File a task from an inbox item. Previewed.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      key: { type: "string" },
      title: { type: "string" },
      clientSlug: { type: "string" },
    },
    required: ["key", "title"],
  },
  async preview(args) {
    const slug = str(args, "clientSlug")
    const client = slug
      ? await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
      : null
    return {
      title: "Task from inbox",
      fields: [
        { label: "Title", value: str(args, "title") ?? "—" },
        { label: "From", value: str(args, "key") ?? "—" },
        { label: "Client", value: client?.name ?? slug ?? "—" },
      ],
    }
  },
  async run(args, ctx) {
    const key = str(args, "key")
    const title = str(args, "title")
    if (!key || !title) throw new Error("`key` and `title` are required.")
    const slug = str(args, "clientSlug")
    const client = slug
      ? await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
      : null
    const result = await makeInboxTask({
      key,
      title,
      clientId: client?.id ?? null,
      userId: ctx.userId,
    })
    if (!result.ok) throw new Error(result.error)
    return { taskId: result.taskId, title }
  },
}

export const INBOX_TOOLS: readonly ToolSpec[] = [
  peekAgentMailboxTool,
  listInboxTool,
  readMailTool,
  searchMailTool,
  syncInboxTool,
  archiveInboxItemTool,
  snoozeInboxItemTool,
  assignInboxItemTool,
  inboxToTicketTool,
  inboxToTaskTool,
]
