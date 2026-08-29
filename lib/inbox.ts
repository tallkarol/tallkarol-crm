import type { TicketPriority } from "@/lib/support"

/**
 * The unified inbox: one stream over everything that arrives.
 *
 * Read as a union at query time rather than materialised into a table — no
 * dual-write, nothing to backfill, and at this volume it is instant. The only
 * thing stored is triage state, and **unread is the absence of a row**, so a
 * new source starts feeding the stream without touching anything.
 *
 * Move to a materialised `inbox_items` table when mail volume actually argues
 * for it; `inbox_state` is written the same way either way, so that decision
 * stays cheap.
 *
 * This half is PURE — the console imports it, so a `db` import here would drag
 * postgres into the browser bundle. The query lives in `lib/inbox-data.ts`.
 */

export const INBOX_KINDS = ["lead", "ticket", "message", "mail", "event"] as const
export type InboxKind = (typeof INBOX_KINDS)[number]

export const KIND_LABEL: Record<InboxKind, string> = {
  lead: "Lead",
  ticket: "Ticket",
  message: "Reply",
  mail: "Email",
  event: "Event",
}

export const KIND_TONE: Record<InboxKind, string> = {
  lead: "bg-tk-teal/10 text-tk-teal",
  ticket: "bg-[#8A5A05]/12 text-[#8A5A05]",
  message: "bg-[#8A5A05]/12 text-[#8A5A05]",
  mail: "bg-tk-slate/[0.08] text-tk-slate/70",
  event: "bg-[#26684A]/10 text-[#26684A]",
}

export type InboxItemState = "unread" | "read" | "snoozed" | "archived"

export type InboxItem = {
  /** `${kind}:${id}` — the triage-state key and the URL selector. */
  key: string
  kind: InboxKind
  id: string
  title: string
  snippet: string
  actor: string
  clientSlug: string | null
  clientName: string | null
  color: string
  occurredAt: string
  ageDays: number
  state: InboxItemState
  /** Waiting on us specifically, not merely open. */
  needsReply: boolean
  priority: TicketPriority | null
  /** Where "open in full" goes, when there is a fuller surface. */
  href: string | null
}

export const INBOX_LENSES = [
  { id: "unread", label: "Unread" },
  { id: "reply", label: "Needs reply" },
  { id: "snoozed", label: "Snoozed" },
  { id: "all", label: "Everything" },
  { id: "archive", label: "Archive" },
] as const
export type InboxLens = (typeof INBOX_LENSES)[number]["id"]

export function isInboxLens(value: unknown): value is InboxLens {
  return INBOX_LENSES.some((l) => l.id === value)
}

export type InboxData = {
  items: InboxItem[]
  counts: Record<InboxLens, number> & { byKind: Record<InboxKind, number> }
  clients: { id: string; slug: string; name: string; color: string }[]
  /** False until migration 0027 is applied — the page says so rather than dying. */
  ready: boolean
}

/** The lens decides which items are in view; the client filters do the rest. */
export function matchesLens(item: InboxItem, lens: InboxLens) {
  if (lens === "archive") return item.state === "archived"
  if (item.state === "archived") return false
  if (lens === "unread") return item.state === "unread"
  if (lens === "reply") return item.needsReply && item.state !== "snoozed"
  if (lens === "snoozed") return item.state === "snoozed"
  return true
}

/** Day buckets for the stream — Today / Yesterday / a date. */
export function dayBucket(iso: string, now = new Date()) {
  const at = new Date(iso)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.floor((startOfToday.getTime() - at.getTime()) / 86_400_000)
  if (at >= startOfToday) return "Today"
  if (diff < 1) return "Yesterday"
  if (diff < 7) return at.toLocaleDateString("en-US", { weekday: "long" })
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
