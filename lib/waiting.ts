import { ATTENTION_RULES } from "@/lib/attention"
import { agoLabel, clip, STATE_LABEL, type NoteState } from "@/lib/leftoff"
import type { ItemState } from "@/lib/punchlist"
import type { TicketPriority } from "@/lib/support"

/**
 * The decision queue — the pure half.
 *
 * `session_notes` has the verbs already: reply, dismiss, convert. They sat
 * behind a modal nobody opened, so in seventy-nine rows nothing was ever
 * pinned, replied to or converted. This is the same work re-cut as one flat
 * ranked list that is always on screen, and the rule that decides what enters
 * it is Karol's: a row belongs here only when HE is the bottleneck and one tap
 * moves it. Overdue tasks qualify; the fifty-eight merely-open ones do not.
 *
 * Every verb names an endpoint that already exists — nothing here invents a
 * mutation. That is the whole reason `verbs` is data rather than markup: the
 * Mac app adds one case for `/api/widget/waiting` and gets all eight kinds,
 * and the browser strip reads the same array to decide which affordances to
 * draw. One list of what can be done to a row, two surfaces drawing it.
 *
 * Destinations are passed in rather than built here. Three of the eight kinds
 * are folded out of widget payloads that already carry their own `href`, and
 * one source of truth for where a row leads beats two that can drift.
 *
 * No db import: `lib/waiting-data.ts` is the db half. Same split, and for the
 * same reason, as `lib/leftoff.ts` vs `lib/leftoff-data.ts`.
 */

export const WAITING_RULES = {
  /**
   * A metered session under this is rounding error, not a billing decision.
   * `logAgentTime` would take it; a queue row that earns four minutes is what
   * teaches you to stop reading the queue.
   */
  minUnbilledHours: 0.25,
  /** Past this many days over its due date, an overdue task stops being warn. */
  taskHotDays: 7,
  /** An enquiry unanswered longer than this is the one that goes elsewhere. */
  inquiryHotHours: 24,
  /** Two failed runs in a row is a pattern; one is a blip. */
  monitorHotStreak: 2,
  /**
   * How many rows the queue hands out. `counts` and `total` still report
   * everything that qualified, so a caller can say "+9 more" honestly rather
   * than believing the cap is the truth.
   */
  maxItems: 24,
  /** A card is one line of title over one line of subtitle. */
  maxTitle: 120,
  maxSubtitle: 160,
} as const

/* ------------------------------------------------------------------ kinds */

export const WAITING_KINDS = [
  "blocked_chat",
  "monitor_failing",
  "ticket_no_reply",
  "new_inquiry",
  "overdue_task",
  "punchlist_item",
  "untested_item",
  "unbilled_session",
] as const
export type WaitingKind = (typeof WAITING_KINDS)[number]

/**
 * The order the queue is read in — the same idea as `STATE_RANK` in
 * `lib/leftoff.ts`, and for the same reason: a table can be read and argued
 * with, an ad-hoc comparator cannot.
 *
 * It ranks by how expensive the stall is. A blocked chat is an agent frozen
 * mid-turn right now; a failing monitor is something a client pays for being
 * down; a ticket and an enquiry are somebody else's clock running. Only then
 * come our own promises, and last the money we have already earned.
 */
export const KIND_RANK: Record<WaitingKind, number> = {
  blocked_chat: 0,
  monitor_failing: 1,
  ticket_no_reply: 2,
  new_inquiry: 3,
  overdue_task: 4,
  punchlist_item: 5,
  untested_item: 6,
  unbilled_session: 7,
}

export const KIND_LABEL: Record<WaitingKind, string> = {
  blocked_chat: "Chat",
  monitor_failing: "Uptime",
  ticket_no_reply: "Ticket",
  new_inquiry: "Enquiry",
  overdue_task: "Overdue",
  punchlist_item: "Punch list",
  untested_item: "Untested",
  unbilled_session: "Unbilled",
}

/** Two words from `lib/attention.ts`, plus the rung a ledger row sits on. */
export type WaitingSeverity = "hot" | "warn" | "quiet"

const SEVERITY_RANK: Record<WaitingSeverity, number> = { hot: 0, warn: 1, quiet: 2 }

/* ------------------------------------------------------------------ verbs */

export const VERB_IDS = ["reply", "dismiss", "complete", "log", "open"] as const
export type VerbId = (typeof VERB_IDS)[number]

/**
 * One thing you can do to a row without leaving the queue.
 *
 * `post` is an endpoint that already shipped — see the module header. `open`
 * is the fallback for the kinds whose write path is a screen rather than a
 * route, and carries no `post` at all.
 */
export type WaitingVerb = {
  id: VerbId
  label: string
  /**
   * What the verb acts on — a session ref, a task id. Carried out of the
   * endpoint rather than parsed back out of `post`, because the browser strip
   * runs the same verbs through the CRM's own server actions and would
   * otherwise have to take a path apart to find the id.
   */
  ref: string
  /** The existing POST this verb runs. "" on `open`, which is a link. */
  post: string
  /** The JSON body that POST needs, minus anything typed at the tap. */
  body: Record<string, string>
  /** True when the verb cannot be sent until you have typed something. */
  needsText: boolean
  /** Where the verb lands when it has no POST. "" otherwise. */
  href: string
}

const LEFTOFF_REPLY = "/api/leftoff/reply"
const LEFTOFF_DISMISS = "/api/leftoff/dismiss"
const AGENT_LOG = "/api/widget/agent/log"
const TASK_COMPLETE = "/api/widget/complete"

function replyVerb(sessionRef: string): WaitingVerb {
  return {
    id: "reply",
    label: "Reply",
    ref: sessionRef,
    post: LEFTOFF_REPLY,
    body: { sessionRef },
    needsText: true,
    href: "",
  }
}

function dismissVerb(sessionRef: string): WaitingVerb {
  return {
    id: "dismiss",
    label: "Dismiss",
    ref: sessionRef,
    post: LEFTOFF_DISMISS,
    body: { sessionRef },
    needsText: false,
    href: "",
  }
}

function logVerb(sessionRef: string): WaitingVerb {
  return {
    id: "log",
    label: "Log it",
    ref: sessionRef,
    post: AGENT_LOG,
    body: { sessionRef },
    needsText: false,
    href: "",
  }
}

function completeVerb(taskId: string): WaitingVerb {
  return {
    id: "complete",
    label: "Done",
    ref: taskId,
    post: `${TASK_COMPLETE}/${taskId}`,
    body: {},
    needsText: false,
    href: "",
  }
}

function openVerb(label: string, href: string): WaitingVerb {
  return { id: "open", label, ref: "", post: "", body: {}, needsText: false, href }
}

/* ------------------------------------------------------------------ item */

export type WaitingClient = { slug: string; name: string; color: string }

export type WaitingItem = {
  /** `<kind>:<source id>` — unique across kinds, so a list can key on it. */
  id: string
  kind: WaitingKind
  title: string
  /** The second line: what is actually stuck, in the fewest honest words. */
  subtitle: string
  /** The client's name. "" is house work, and the caller draws it as such. */
  client: string
  /** The client's accent. "" when there is no client. */
  color: string
  /** When the clock on this row started, ISO. */
  since: string
  /** "20m", "3d" — `agoLabel` over `since`, so the queue and the board agree. */
  ageLabel: string
  severity: WaitingSeverity
  verbs: WaitingVerb[]
  href: string
}

export type WaitingCounts = Record<WaitingKind, number>

export type WaitingPayload = {
  generatedAt: string
  /** Ranked, and cut to `maxItems`. Never the whole truth — `counts` is. */
  items: WaitingItem[]
  /** Everything that qualified, per kind, cap or no cap. */
  counts: WaitingCounts
  total: number
}

export function emptyCounts(): WaitingCounts {
  const counts = {} as WaitingCounts
  for (const kind of WAITING_KINDS) counts[kind] = 0
  return counts
}

/* ----------------------------------------------------------------- inputs */

/**
 * What the db half hands over. Each shape is already filtered to rows that
 * could qualify — `surface = 'repo'` and `state = 'gone'` never leave the
 * query — and every one carries its own `href`.
 */
export type ChatFacts = {
  sessionRef: string
  surface: string
  title: string
  project: string
  /** The state the hook stored; the band is derived from it and `eventAt`. */
  state: NoteState
  blockedOn: string
  lastPrompt: string
  eventAt: Date
  client: WaitingClient | null
  href: string
}

export type SessionFacts = {
  sessionRef: string
  name: string
  summary: string
  hours: number
  endedAt: Date
  client: WaitingClient
  href: string
}

export type PunchItemFacts = {
  id: string
  /** The task the tick goes through. An item without one cannot be ticked. */
  taskId: string | null
  listTitle: string
  /** Position in the filed list — the number the punch-list page prints. */
  index: number
  title: string
  state: ItemState
  /** True when the item carries a test spec at all. */
  hasTest: boolean
  /** queued | running | pass | fail | blocked, or "" when it never ran. */
  testStatus: string
  /** The day the list was filed. See `buildWaiting` for why not the item's. */
  filedAt: Date
  client: WaitingClient
  href: string
}

export type TicketWaitFacts = {
  id: string
  number: string
  title: string
  priority: TicketPriority
  openedAt: Date
  client: WaitingClient | null
  href: string
}

export type OverdueTaskFacts = {
  id: string
  title: string
  /** YYYY-MM-DD, already known to be in the past. */
  dueOn: string
  /** Whole days past due — the db half has the workspace's today. */
  daysOver: number
  /** The day it went past due, so the row ages from the miss. */
  overdueSince: Date
  client: WaitingClient | null
  href: string
}

export type MonitorFacts = {
  slug: string
  name: string
  failStreak: number
  /** An incident ticket is already open for it. */
  hasOpenIncident: boolean
  /** Last time it was seen healthy — the clock on the outage. */
  since: Date
  client: WaitingClient | null
  href: string
}

export type InquiryFacts = {
  id: string
  name: string
  company: string
  source: string
  createdAt: Date
  href: string
}

export type WaitingFacts = {
  chats: ChatFacts[]
  sessions: SessionFacts[]
  punchItems: PunchItemFacts[]
  tickets: TicketWaitFacts[]
  overdueTasks: OverdueTaskFacts[]
  monitors: MonitorFacts[]
  inquiries: InquiryFacts[]
}

/* ------------------------------------------------------------------ shape */

const HOUR = 3_600_000

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000))
}

function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`
}

function item(
  kind: WaitingKind,
  sourceId: string,
  fields: {
    title: string
    subtitle: string
    client: WaitingClient | null
    since: Date
    severity: WaitingSeverity
    verbs: WaitingVerb[]
    href: string
  },
  now: Date
): WaitingItem {
  return {
    id: `${kind}:${sourceId}`,
    kind,
    title: clip(fields.title, WAITING_RULES.maxTitle) || "(untitled)",
    subtitle: clip(fields.subtitle, WAITING_RULES.maxSubtitle),
    client: fields.client?.name ?? "",
    color: fields.client?.color ?? "",
    since: fields.since.toISOString(),
    ageLabel: agoLabel(fields.since, now),
    severity: fields.severity,
    verbs: fields.verbs,
    href: fields.href,
  }
}

/* ------------------------------------------------------------------ chats */

/**
 * `working` and `gone` never reach the queue — a chat mid-turn is not waiting
 * on anybody and a finished one is history — but the map has to be total, so
 * they carry the rung that would sort them last if they ever did.
 */
const CHAT_SEVERITY: Record<NoteState, WaitingSeverity> = {
  blocked: "hot",
  parked: "warn",
  waiting: "warn",
  working: "quiet",
  gone: "quiet",
}

/**
 * A prompt that opens with a tag is the harness talking, not you — the
 * `<task-notification>` envelope a finished subagent injects into the turn.
 * It is a wall of tool ids and would eat the one line a card has, so the row
 * falls back to saying what it is instead of quoting machinery at you.
 */
function promptLine(prompt: string) {
  const flat = prompt.trim()
  return flat.startsWith("<") ? "" : flat
}

function chatItem(chat: ChatFacts, now: Date): WaitingItem {
  const what =
    chat.state === "blocked"
      ? chat.blockedOn
        ? `Wants: ${chat.blockedOn}`
        : "Stopped on a permission prompt"
      : promptLine(chat.lastPrompt) || "Stopped and is waiting on you"
  const where = chat.project ? `${STATE_LABEL[chat.state]} · ${chat.project}` : STATE_LABEL[chat.state]
  return item(
    "blocked_chat",
    chat.sessionRef,
    {
      title: chat.title || chat.project || chat.sessionRef,
      subtitle: `${where} — ${what}`,
      client: chat.client,
      since: chat.eventAt,
      severity: CHAT_SEVERITY[chat.state],
      verbs: [replyVerb(chat.sessionRef), dismissVerb(chat.sessionRef)],
      href: chat.href,
    },
    now
  )
}

/* --------------------------------------------------------------- monitors */

function monitorItem(monitor: MonitorFacts, now: Date): WaitingItem {
  const streak = monitor.failStreak
  const detail = streak > 0 ? `${plural(streak, "run")} failed in a row` : "Incident still open"
  return item(
    "monitor_failing",
    monitor.slug,
    {
      title: monitor.name || monitor.slug,
      subtitle: `${detail} · last healthy ${agoLabel(monitor.since, now)} ago`,
      client: monitor.client,
      since: monitor.since,
      severity:
        streak >= WAITING_RULES.monitorHotStreak || monitor.hasOpenIncident ? "hot" : "warn",
      verbs: [openVerb("Open uptime", monitor.href)],
      href: monitor.href,
    },
    now
  )
}

/* ---------------------------------------------------------------- tickets */

/**
 * The same rule the delivery ledger flags on — `ATTENTION_RULES.ticketReplyDays`
 * read here rather than re-stated, so the strip and `lib/attention.ts` cannot
 * end up disagreeing about whether the same ticket is late.
 */
export function ticketIsWaiting(ticket: TicketWaitFacts, now: Date) {
  return daysBetween(ticket.openedAt, now) >= ATTENTION_RULES.ticketReplyDays[ticket.priority]
}

function ticketItem(ticket: TicketWaitFacts, now: Date): WaitingItem {
  const days = daysBetween(ticket.openedAt, now)
  return item(
    "ticket_no_reply",
    ticket.id,
    {
      title: ticket.title || ticket.number,
      subtitle: `${ticket.number} · ${ticket.priority} · ${plural(days, "day")} with no reply from us`,
      client: ticket.client,
      since: ticket.openedAt,
      severity: ticket.priority === "urgent" || ticket.priority === "high" ? "hot" : "warn",
      verbs: [openVerb("Open ticket", ticket.href)],
      href: ticket.href,
    },
    now
  )
}

/* -------------------------------------------------------------- enquiries */

function inquiryItem(inquiry: InquiryFacts, now: Date): WaitingItem {
  const where = inquiry.company ? `${inquiry.company} · ${inquiry.source}` : inquiry.source
  return item(
    "new_inquiry",
    inquiry.id,
    {
      title: inquiry.name,
      subtitle: `${where} · nobody has answered it`,
      client: null,
      since: inquiry.createdAt,
      severity:
        now.getTime() - inquiry.createdAt.getTime() > WAITING_RULES.inquiryHotHours * HOUR
          ? "hot"
          : "warn",
      verbs: [openVerb("Open enquiry", inquiry.href)],
      href: inquiry.href,
    },
    now
  )
}

/* ------------------------------------------------------------------ tasks */

function taskItem(task: OverdueTaskFacts, now: Date): WaitingItem {
  return item(
    "overdue_task",
    task.id,
    {
      title: task.title,
      subtitle: `${plural(task.daysOver, "day")} past its due date (${task.dueOn})`,
      client: task.client,
      since: task.overdueSince,
      severity: task.daysOver >= WAITING_RULES.taskHotDays ? "hot" : "warn",
      verbs: [completeVerb(task.id), openVerb("Open task", task.href)],
      href: task.href,
    },
    now
  )
}

/* ------------------------------------------------------------ punch lists */

/**
 * Two kinds out of one input.
 *
 * An open item is work you owe. A done item whose test has never run is a
 * claim nobody has checked — which is the other way you are the bottleneck,
 * and the only one a tick would make worse.
 */
function punchItem(row: PunchItemFacts, now: Date): WaitingItem | null {
  const failing = row.testStatus === "fail" || row.testStatus === "blocked"
  if (row.state !== "done") {
    return item(
      "punchlist_item",
      row.id,
      {
        title: row.title,
        subtitle: `${row.listTitle} · item ${row.index}${failing ? " · its test is failing" : ""}`,
        client: row.client,
        since: row.filedAt,
        severity: failing ? "hot" : "warn",
        // An item with no task behind it cannot be ticked from anywhere —
        // only a draft list is like that, and drafts never reach the queue.
        verbs: row.taskId
          ? [completeVerb(row.taskId), openVerb("Open item", row.href)]
          : [openVerb("Open item", row.href)],
        href: row.href,
      },
      now
    )
  }
  if (!row.hasTest || row.testStatus !== "") return null
  return item(
    "untested_item",
    row.id,
    {
      title: row.title,
      subtitle: `${row.listTitle} · item ${row.index} · marked done, its test has never run`,
      client: row.client,
      since: row.filedAt,
      severity: "quiet",
      verbs: [openVerb("Run the test", row.href)],
      href: row.href,
    },
    now
  )
}

/* --------------------------------------------------------------- sessions */

function sessionItem(session: SessionFacts, now: Date): WaitingItem {
  const hours = session.hours.toLocaleString("en-US", { maximumFractionDigits: 2 })
  return item(
    "unbilled_session",
    session.sessionRef,
    {
      title: session.name || session.summary || session.sessionRef,
      subtitle: `${hours} metered ${session.hours === 1 ? "hour" : "hours"} never reached a timesheet`,
      client: session.client,
      since: session.endedAt,
      severity: "quiet",
      verbs: [logVerb(session.sessionRef), openVerb("Open session", session.href)],
      href: session.href,
    },
    now
  )
}

/* ------------------------------------------------------------------ build */

/**
 * One flat ranked list.
 *
 * Kind first, from `KIND_RANK`; then severity; then oldest first, because in
 * every one of these kinds the longer a row has sat the worse it has got —
 * an agent frozen for three hours, a ticket unanswered for nine days, an
 * enquiry that went somewhere else while it waited.
 *
 * A punch-list item ages from the day its list was filed rather than its own
 * day, because `ItemView` carries no timestamps. Same limitation, same
 * wording, as the deliverables note in `lib/attention.ts`.
 */
export function sortWaiting(items: WaitingItem[]) {
  return [...items].sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.since < b.since ? -1 : a.since > b.since ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

export function buildWaiting(facts: WaitingFacts, now: Date): WaitingPayload {
  const items: WaitingItem[] = [
    ...facts.chats.map((chat) => chatItem(chat, now)),
    ...facts.monitors.map((monitor) => monitorItem(monitor, now)),
    ...facts.tickets.filter((t) => ticketIsWaiting(t, now)).map((t) => ticketItem(t, now)),
    ...facts.inquiries.map((inquiry) => inquiryItem(inquiry, now)),
    ...facts.overdueTasks.map((task) => taskItem(task, now)),
    ...facts.punchItems
      .map((row) => punchItem(row, now))
      .filter((row): row is WaitingItem => row !== null),
    ...facts.sessions
      .filter((s) => s.hours >= WAITING_RULES.minUnbilledHours)
      .map((s) => sessionItem(s, now)),
  ]

  const counts = emptyCounts()
  for (const row of items) counts[row.kind] += 1

  return {
    generatedAt: now.toISOString(),
    items: sortWaiting(items).slice(0, WAITING_RULES.maxItems),
    counts,
    total: items.length,
  }
}
