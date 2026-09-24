import { ROUTES } from "@/lib/nav"

/**
 * The pulse — the four quick hits at the top of the dashboard's Needs
 * attention card, in Karol's order: tickets, mail, tasks, pipeline (24 Sep
 * 2026, from the "Four rows" mockup). Pure by contract: `pulse-data.ts`
 * gathers facts, the builders here turn facts into rows, and
 * `scripts/check-pulse.ts` feeds facts by hand.
 *
 * A stat is a number, a name, one line of why, and a door — a page, or the
 * expanded list filtered to a bucket. A row's state phrase is its loudest
 * stat's. Colour means one thing: red is past a line (a reply window, a
 * due date), amber needs you but is in time, green is the only good news
 * (done, accepted, caught up). Nothing the other cards already say is here:
 * unpaid lives in Month billed and Forecast, events in the Calendar.
 */
export const PULSE_ROWS = ["tickets", "mail", "tasks", "pipeline"] as const
export type PulseRowKey = (typeof PULSE_ROWS)[number]
export type PulseTone = "bad" | "warn" | "good" | "neutral"

export type PulseStat = {
  key: string
  n: number
  label: string
  /** The line under the name — "oldest 132d · Artist House". Null says nothing. */
  hint: string | null
  /** Colour on the number while n > 0. */
  tone: PulseTone
  /** Where a click goes: a page … */
  href?: string
  /** … or the expanded list, filtered to this bucket (an AttentionGroup id). */
  group?: string
}

export type PulseRow = {
  key: PulseRowKey
  name: string
  /** "3 need you now", "caught up" — the loudest stat, in words. */
  state: string
  tone: PulseTone
  /** The › at the row's end. */
  href: string
  stats: PulseStat[]
}

export type Pulse = { rows: PulseRow[] }

/** localStorage: the row keys the user keeps folded. */
export const PULSE_FOLD_KEY = "dashboard-pulse-folded"

export function isPulseRowKey(value: unknown): value is PulseRowKey {
  return (PULSE_ROWS as readonly string[]).includes(value as string)
}

/* ------------------------------------------------------------ facts */

export type TicketFacts = {
  open: number
  clients: number
  /** Open, no first reply yet, not waiting on the client. */
  needAnswer: number
  /** Of those, urgent or high. */
  urgent: number
  /** Of those, past the reply window for their priority. */
  overdue: number
  oldestOverdueDays: number | null
  oldestOverdueClient: string | null
  oldestOverdueHref: string | null
  /** State = waiting: the ball is with the client. */
  waiting: number
  oldestWaitingDays: number | null
}

export type MailFacts = {
  unread: number
  oldestUnreadDays: number | null
  /** Needs a reply from you, not snoozed. */
  owed: number
  oldestOwedDays: number | null
  /** Snoozes that ended today — back in the unread lens. */
  backToday: number
  /** Still snoozed. */
  snoozed: number
}

export type TaskFacts = {
  overdue: number
  oldestOverdueDays: number | null
  dueToday: number
  dueTodayFirst: string | null
  /** Due within the week, today included. */
  week: number
  /** "Sat 26" — the next due date's label. */
  nextDue: string | null
  waiting: number
  waitingFirst: string | null
  doneWeek: number
  doneToday: number
}

export type PipelineFacts = {
  newLeads: number
  newestLeadDays: number | null
  newestLeadSource: string | null
  /** Inquiries you have answered and are talking to. */
  talking: number
  oldestTalkingDays: number | null
  /** Proposals sent, not yet answered, newest first. */
  out: { name: string; days: number }[]
  /** Accepted this month. */
  accepted: { name: string }[]
}

export type PulseFacts = { tickets: TicketFacts; mail: MailFacts; tasks: TaskFacts; pipeline: PipelineFacts }

/* ------------------------------------------------------------ builders */

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/** "132d" · "today" */
export function days(n: number | null): string | null {
  if (n == null) return null
  return n <= 0 ? "today" : `${n}d`
}

export function ticketsRow(f: TicketFacts): PulseRow {
  const tone: PulseTone = f.overdue > 0 ? "bad" : f.needAnswer > 0 ? "warn" : "good"
  const state = f.overdue > 0 ? `${f.overdue} need you now` : f.needAnswer > 0 ? `${f.needAnswer} need an answer` : "all answered"
  return {
    key: "tickets",
    name: "Tickets",
    state,
    tone,
    href: `${ROUTES.support}?state=active`,
    stats: [
      { key: "open", n: f.open, label: "Open", hint: f.open > 0 ? plural(f.clients, "client") : null, tone: "neutral", href: `${ROUTES.support}?state=active` },
      { key: "answer", n: f.needAnswer, label: "Need an answer", hint: f.urgent > 0 ? `${f.urgent} urgent` : null, tone: "warn", href: `${ROUTES.support}?state=open` },
      {
        key: "overdue",
        n: f.overdue,
        label: "Reply overdue",
        hint: f.overdue > 0 ? [f.oldestOverdueDays != null ? `oldest ${days(f.oldestOverdueDays)}` : null, f.oldestOverdueClient].filter(Boolean).join(" · ") || null : null,
        tone: "bad",
        href: f.oldestOverdueHref ?? `${ROUTES.support}?state=open`,
      },
      { key: "waiting", n: f.waiting, label: "Waiting on them", hint: f.waiting > 0 && f.oldestWaitingDays != null ? `oldest ${days(f.oldestWaitingDays)}` : null, tone: "neutral", href: `${ROUTES.support}?state=waiting` },
    ],
  }
}

export function mailRow(f: MailFacts): PulseRow {
  const tone: PulseTone = f.owed > 0 ? "bad" : f.backToday > 0 ? "warn" : f.unread > 0 ? "neutral" : "good"
  const state =
    f.owed > 0 ? plural(f.owed, "reply owed", "replies owed") : f.backToday > 0 ? `${f.backToday} back today` : f.unread > 0 ? `${f.unread} unread` : "caught up"
  return {
    key: "mail",
    name: "Mail",
    state,
    tone,
    href: `${ROUTES.inbox}?lens=unread`,
    stats: [
      { key: "unread", n: f.unread, label: "Unread", hint: f.unread > 0 && f.oldestUnreadDays != null ? `oldest ${days(f.oldestUnreadDays)}` : null, tone: "neutral", href: `${ROUTES.inbox}?lens=unread` },
      { key: "owed", n: f.owed, label: "Replies owed", hint: f.owed > 0 && f.oldestOwedDays != null ? `oldest ${days(f.oldestOwedDays)}` : null, tone: "bad", href: `${ROUTES.inbox}?lens=reply` },
      { key: "back", n: f.backToday, label: "Back today", hint: f.snoozed > 0 ? `of ${f.snoozed} snoozed` : null, tone: "warn", href: `${ROUTES.inbox}?lens=${f.backToday > 0 ? "unread" : "snoozed"}` },
    ],
  }
}

export function tasksRow(f: TaskFacts): PulseRow {
  const tone: PulseTone = f.overdue > 0 ? "bad" : f.dueToday > 0 ? "warn" : "good"
  const state = f.overdue > 0 ? `${f.overdue} overdue` : f.dueToday > 0 ? `${f.dueToday} due today` : "nothing overdue"
  return {
    key: "tasks",
    name: "Tasks",
    state,
    tone,
    href: ROUTES.tasks,
    stats: [
      { key: "overdue", n: f.overdue, label: "Overdue", hint: f.overdue > 0 && f.oldestOverdueDays != null ? `oldest ${days(f.oldestOverdueDays)}` : null, tone: "bad", group: "overdue" },
      { key: "today", n: f.dueToday, label: "Due today", hint: f.dueToday > 0 ? f.dueTodayFirst : null, tone: "warn", group: "week" },
      { key: "week", n: f.week, label: "This week", hint: f.week > 0 && f.nextDue ? `next ${f.nextDue}` : null, tone: "neutral", group: "week" },
      { key: "waiting", n: f.waiting, label: "Waiting", hint: f.waiting > 0 ? f.waitingFirst : "on a client", tone: "neutral", group: "waiting" },
      { key: "done", n: f.doneWeek, label: "Done", hint: f.doneWeek > 0 ? `this week${f.doneToday > 0 ? ` · ${f.doneToday} today` : ""}` : "this week", tone: "good", href: ROUTES.tasks },
    ],
  }
}

export function pipelineRow(f: PipelineFacts): PulseRow {
  const tone: PulseTone = f.newLeads > 0 || f.out.length > 0 ? "warn" : "neutral"
  const state = f.newLeads > 0 ? plural(f.newLeads, "new lead") : f.out.length > 0 ? plural(f.out.length, "proposal out", "proposals out") : "nothing moving"
  const outHint = f.out
    .slice(0, 2)
    .map((p) => `${p.name} ${days(p.days)}`)
    .join(" · ")
  return {
    key: "pipeline",
    name: "Pipeline",
    state,
    tone,
    href: ROUTES.leads,
    stats: [
      {
        key: "leads",
        n: f.newLeads,
        label: "New leads",
        hint: f.newLeads > 0 ? [f.newestLeadDays != null ? (f.newestLeadDays <= 0 ? "today" : `${days(f.newestLeadDays)} ago`) : null, f.newestLeadSource ? `via ${f.newestLeadSource}` : null].filter(Boolean).join(" · ") || null : null,
        tone: "warn",
        href: ROUTES.leads,
      },
      { key: "talking", n: f.talking, label: "Talking", hint: f.talking > 0 && f.oldestTalkingDays != null ? `oldest ${days(f.oldestTalkingDays)}` : null, tone: "neutral", href: ROUTES.leads },
      { key: "out", n: f.out.length, label: "Proposals out", hint: outHint || null, tone: "warn", href: ROUTES.proposals },
      { key: "accepted", n: f.accepted.length, label: "Accepted", hint: f.accepted.length > 0 ? `this month · ${f.accepted[0].name}` : "this month", tone: "good", href: ROUTES.proposals },
    ],
  }
}

export function buildPulse(f: PulseFacts): Pulse {
  return { rows: [ticketsRow(f.tickets), mailRow(f.mail), tasksRow(f.tasks), pipelineRow(f.pipeline)] }
}

/**
 * What a folded row still says: only the stats that need you (red or
 * amber, above zero), as "26 overdue · 2 due today". Empty means nothing
 * needs you.
 */
export function digestOf(row: PulseRow): { text: string; tone: PulseTone }[] {
  return row.stats
    .filter((s) => s.n > 0 && (s.tone === "bad" || s.tone === "warn"))
    .map((s) => ({ text: `${s.n} ${s.label.toLowerCase()}`, tone: s.tone }))
}
