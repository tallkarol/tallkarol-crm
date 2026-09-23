import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { supportTickets, ticketMessages } from "@/db/schema"
import { ATTENTION_RULES } from "@/lib/attention"
import type { ClientShell } from "@/lib/client-rooms"
import { loadInbox, loadInboxMail } from "@/lib/inbox-data"
import { INBOX_KINDS, KIND_LABEL, KIND_TONE, type InboxItem, type InboxItemState, type InboxKind, type InboxSeverity } from "@/lib/inbox"
import { loadNote, notesForClient, type ItemView, type NoteRow } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"
import { ticketNumber, ticketPriority, ticketState, type TicketPriority, type TicketState } from "@/lib/support"
import { approvalLine, type ApprovalFacts } from "@/lib/waiting"
import { approvalFacts } from "@/lib/waiting-data"

/**
 * The Inbox room's own loader: one client's slice of the shared inbox
 * (`lib/inbox-data.ts`), plus the two things that live outside that union —
 * parked agent approvals and proposed meeting-note items. Both frozen files
 * stay untouched; this assembles on top of them.
 *
 * Kept apart from the room's component the same way `lib/inbox.ts` is split
 * from `lib/inbox-data.ts`: this file imports `@/db`, so nothing that imports
 * it may ever be a `"use client"` file. `components/clients/InboxRoom.tsx`
 * (a server component) is the only importer; its triage bar takes plain
 * strings instead of importing this module.
 */

export const ROOM_LENSES = [
  { id: "needs", label: "Needs you" },
  { id: "unread", label: "Unread" },
  { id: "all", label: "Everything" },
] as const
export type RoomLens = (typeof ROOM_LENSES)[number]["id"]

export function isRoomLens(value: unknown): value is RoomLens {
  return ROOM_LENSES.some((l) => l.id === value)
}

export type RoomKind = InboxKind | "approval" | "proposal"

export function isRoomKind(value: unknown): value is RoomKind {
  return typeof value === "string" && ((INBOX_KINDS as readonly string[]).includes(value) || value === "approval" || value === "proposal")
}

const EXTRA_KIND_LABEL = { approval: "Approval", proposal: "Proposal" } as const
const EXTRA_KIND_TONE = { approval: "bg-accent-soft text-accent-ink", proposal: "bg-well text-ink-2" } as const

export function roomKindLabel(kind: RoomKind): string {
  return kind === "approval" || kind === "proposal" ? EXTRA_KIND_LABEL[kind] : KIND_LABEL[kind]
}

export function roomKindTone(kind: RoomKind): string {
  return kind === "approval" || kind === "proposal" ? EXTRA_KIND_TONE[kind] : KIND_TONE[kind]
}

export type RoomRow = {
  /** `${kind}:${id}` for real inbox items; `approval:<callId>` / `proposal:<itemId>` otherwise. */
  key: string
  kind: RoomKind
  /** The id a verb needs: a ticket/mail id, a callId, a meeting-note item id. */
  refId: string
  title: string
  snippet: string
  from: string
  occurredAt: string
  ageDays: number
  ageLabel: string
  state: InboxItemState
  needsReply: boolean
  /** True only for a ticket past `ATTENTION_RULES.ticketReplyDays` — the brief's own rule. */
  late: boolean
  href: string | null
  severity?: InboxSeverity
  /** Set only for kind "approval" — whether Confirm may be offered at all. */
  canConfirm?: boolean
}

export type TicketDetailFacts = {
  id: string
  number: string
  title: string
  priority: TicketPriority
  state: TicketState
  platform: string
  submittedBy: string
  contactEmail: string
  description: string
  dueOn: string | null
}

export type MessageDetailFacts = { id: string; role: string; author: string; body: string; sentAt: string }

export type MailDetailFacts = {
  from: string
  fromEmail: string
  to: string
  subject: string
  body: string
  receivedAt: string
}

export type RoomDetail =
  | { kind: "ticket" | "message"; ticket: TicketDetailFacts; messages: MessageDetailFacts[] }
  | { kind: "mail"; mail: MailDetailFacts }
  | { kind: "event" }
  | { kind: "lead" }
  | { kind: "approval"; approval: { tool: string; thread: string; parkedAt: string; canConfirm: boolean } }
  | { kind: "proposal"; note: { id: string; title: string }; item: ItemView }

export type RoomData = {
  lens: RoomLens
  kind: RoomKind | null
  /** Already lens+kind filtered and sorted — what the list renders. */
  rows: RoomRow[]
  kinds: { kind: RoomKind; label: string; tone: string; count: number }[]
  counts: Record<RoomLens, number>
  selected: RoomRow | null
  detail: RoomDetail | null
}

/* -------------------------------------------------------------- helpers */

function ageLabelOf(days: number) {
  if (days <= 0) return "today"
  if (days < 60) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}

function daysSince(at: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000))
}

/** The brief's own rule, restated: a ticket is late past its priority's reply window. */
function isLateTicket(item: InboxItem) {
  if (item.kind !== "ticket" || !item.priority) return false
  return item.ageDays >= ATTENTION_RULES.ticketReplyDays[item.priority]
}

function matchesRoomLens(row: RoomRow, lens: RoomLens): boolean {
  if (lens === "all") return true
  if (lens === "unread") return row.state === "unread"
  return row.needsReply && row.state !== "snoozed"
}

function sortRoomRows(rows: RoomRow[], lens: RoomLens) {
  if (lens === "needs") {
    rows.sort((a, b) => Number(b.late) - Number(a.late) || (a.occurredAt < b.occurredAt ? -1 : 1))
  } else {
    rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
  }
}

/* --------------------------------------------------------- row builders */

function rowFromInboxItem(item: InboxItem): RoomRow {
  return {
    key: item.key,
    kind: item.kind,
    refId: item.id,
    title: item.title,
    snippet: item.snippet,
    from: item.actor,
    occurredAt: item.occurredAt,
    ageDays: item.ageDays,
    ageLabel: ageLabelOf(item.ageDays),
    state: item.state,
    needsReply: item.needsReply,
    late: isLateTicket(item),
    href: item.href,
    severity: item.kind === "event" ? item.severity : undefined,
  }
}

function rowFromApproval(a: ApprovalFacts, now: Date): RoomRow {
  const days = daysSince(a.parkedAt, now)
  return {
    key: `approval:${a.callId}`,
    kind: "approval",
    refId: a.callId,
    title: approvalLine(a),
    snippet: `Parked in ${a.thread}${a.canConfirm ? "" : " — open it to read the fields"}`,
    from: a.thread,
    occurredAt: a.parkedAt.toISOString(),
    ageDays: days,
    ageLabel: ageLabelOf(days),
    state: "unread",
    needsReply: true,
    late: false,
    href: a.href,
    canConfirm: a.canConfirm,
  }
}

/** Ages from the meeting's own start, same basis `loadSignals` uses for this row. */
function rowFromProposal(note: NoteRow, item: ItemView, now: Date): RoomRow {
  const since = note.startedAt ? new Date(note.startedAt) : new Date(note.createdAt)
  const days = daysSince(since, now)
  return {
    key: `proposal:${item.id}`,
    kind: "proposal",
    refId: item.id,
    title: item.title || `Proposed from "${note.title}"`,
    snippet: item.detail || item.quote,
    from: note.title || "Meeting note",
    occurredAt: since.toISOString(),
    ageDays: days,
    ageLabel: ageLabelOf(days),
    state: "unread",
    needsReply: true,
    late: false,
    href: ROUTES.meetingNote(note.id),
  }
}

/* ------------------------------------------------------------------ load */

export async function loadClientInboxRoom(
  client: ClientShell,
  opts: { lens: RoomLens; kind: RoomKind | null; itemKey: string | null },
  now = new Date()
): Promise<RoomData> {
  const [inbox, approvals, notes] = await Promise.all([
    loadInbox(now).catch(() => null),
    approvalFacts().catch(() => [] as ApprovalFacts[]),
    notesForClient(client.id, 20).catch(() => [] as NoteRow[]),
  ])

  const notesWithProposals = notes.filter((n) => n.items.proposed > 0)
  const loadedNotes = await Promise.all(notesWithProposals.map((n) => loadNote(n.id)))

  const rows: RoomRow[] = []
  const proposalRefs = new Map<string, { note: NoteRow; item: ItemView }>()

  if (inbox) {
    for (const item of inbox.items) {
      if (item.clientSlug !== client.slug) continue
      if (item.kind === "lead") continue
      if (item.state === "archived") continue
      rows.push(rowFromInboxItem(item))
    }
  }

  for (const a of approvals) {
    if (a.client?.slug !== client.slug) continue
    rows.push(rowFromApproval(a, now))
  }

  for (const detail of loadedNotes) {
    if (!detail) continue
    for (const item of detail.itemRows) {
      if (item.state !== "proposed") continue
      const row = rowFromProposal(detail, item, now)
      proposalRefs.set(row.key, { note: detail, item })
      rows.push(row)
    }
  }

  const counts: Record<RoomLens, number> = { needs: 0, unread: 0, all: rows.length }
  const kindCounts = new Map<RoomKind, number>()
  for (const row of rows) {
    if (matchesRoomLens(row, "needs")) counts.needs++
    if (matchesRoomLens(row, "unread")) counts.unread++
    kindCounts.set(row.kind, (kindCounts.get(row.kind) ?? 0) + 1)
  }
  const kinds = Array.from(kindCounts.entries()).map(([kind, count]) => ({
    kind,
    label: roomKindLabel(kind),
    tone: roomKindTone(kind),
    count,
  }))

  const visible = rows.filter((r) => matchesRoomLens(r, opts.lens)).filter((r) => (opts.kind ? r.kind === opts.kind : true))
  sortRoomRows(visible, opts.lens)

  const selected = (opts.itemKey ? visible.find((r) => r.key === opts.itemKey) : null) ?? visible[0] ?? null
  const detail = selected ? await loadRoomDetail(selected, approvals, proposalRefs) : null

  return { lens: opts.lens, kind: opts.kind, rows: visible, kinds, counts, selected, detail }
}

async function ticketIdFromMessage(messageId: string): Promise<string | null> {
  const row = await db.query.ticketMessages.findFirst({
    where: eq(ticketMessages.id, messageId),
    columns: { ticketId: true },
  })
  return row?.ticketId ?? null
}

async function loadRoomDetail(
  row: RoomRow,
  approvals: ApprovalFacts[],
  proposalRefs: Map<string, { note: NoteRow; item: ItemView }>
): Promise<RoomDetail | null> {
  if (row.kind === "ticket" || row.kind === "message") {
    const ticketId = row.kind === "ticket" ? row.refId : await ticketIdFromMessage(row.refId)
    if (!ticketId) return null
    const ticket = await db.query.supportTickets.findFirst({ where: eq(supportTickets.id, ticketId) })
    if (!ticket) return null
    const messages = await db.query.ticketMessages.findMany({
      where: eq(ticketMessages.ticketId, ticketId),
      orderBy: [asc(ticketMessages.sentAt)],
    })
    return {
      kind: row.kind,
      ticket: {
        id: ticket.id,
        number: ticketNumber(ticket),
        title: ticket.title,
        priority: ticketPriority(ticket.priority),
        state: ticketState(ticket),
        platform: ticket.platform,
        submittedBy: ticket.submittedBy,
        contactEmail: ticket.contactEmail,
        description: ticket.description,
        dueOn: ticket.dueOn,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        author: m.author || m.authorEmail,
        body: m.body,
        sentAt: m.sentAt.toISOString(),
      })),
    }
  }

  if (row.kind === "mail") {
    const mail = await loadInboxMail(row.refId)
    if (!mail) return null
    return {
      kind: "mail",
      mail: {
        from: mail.from.name || mail.from.email,
        fromEmail: mail.from.email,
        to: mail.to,
        subject: mail.subject,
        body: mail.body,
        receivedAt: mail.receivedAt,
      },
    }
  }

  if (row.kind === "approval") {
    const a = approvals.find((x) => x.callId === row.refId)
    if (!a) return null
    return { kind: "approval", approval: { tool: a.tool, thread: a.thread, parkedAt: a.parkedAt.toISOString(), canConfirm: a.canConfirm } }
  }

  if (row.kind === "proposal") {
    const ref = proposalRefs.get(row.key)
    if (!ref) return null
    return { kind: "proposal", note: { id: ref.note.id, title: ref.note.title }, item: ref.item }
  }

  if (row.kind === "event") return { kind: "event" }
  return { kind: "lead" }
}
