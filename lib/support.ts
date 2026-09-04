import type { SupportTicket, TicketMessage, TicketPayload } from "@/db/schema"

/* ---------------------------------------------------------------- states */

export const TICKET_STATES = ["open", "progress", "waiting", "closed"] as const
export type TicketState = (typeof TICKET_STATES)[number]

export const STATE_LABEL: Record<TicketState, string> = {
  open: "open",
  progress: "in progress",
  waiting: "waiting",
  closed: "closed",
}

/**
 * `active` is every state except closed — the default, because a queue you
 * open to work is a queue of things that are not finished. `all` is still
 * there for when you want the archive alongside.
 */
export type StateFilter = TicketState | "all" | "active"

export const STATE_FILTERS: { id: StateFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "progress", label: "In progress" },
  { id: "waiting", label: "Waiting" },
  { id: "closed", label: "Closed" },
]

export const STATE_FILTER_IDS = STATE_FILTERS.map((s) => s.id)

/** What /support opens on. */
export const DEFAULT_STATE: StateFilter = "active"

/** Does a row survive the state filter? The one place that decision is made. */
export function matchesStateFilter(rowState: TicketState, filter: StateFilter) {
  if (filter === "all") return true
  if (filter === "active") return rowState !== "closed"
  return rowState === filter
}

export function stateTone(state: TicketState) {
  if (state === "closed") return "bg-good-soft text-good"
  if (state === "progress") return "bg-tk-teal/10 text-tk-teal"
  if (state === "waiting") return "bg-well text-ink-3"
  return "bg-warn-soft text-warn"
}

/**
 * The one place a ticket's triage state is decided. An explicit `state` set in
 * the CRM wins; otherwise it's read off the source system's own wording.
 */
export function ticketState(t: {
  state: string
  status: string
  completed: boolean
}): TicketState {
  if ((TICKET_STATES as readonly string[]).includes(t.state)) {
    return t.state as TicketState
  }
  if (t.completed || /closed|resolved|done|complete/i.test(t.status)) return "closed"
  if (/progress|working|started|active/i.test(t.status)) return "progress"
  if (/wait|hold|blocked|pending|client/i.test(t.status)) return "waiting"
  return "open"
}

export function isOpenState(state: TicketState) {
  return state !== "closed"
}

/* ------------------------------------------------------------ priorities */

export const PRIORITIES = ["urgent", "high", "normal", "low"] as const
export type TicketPriority = (typeof PRIORITIES)[number]

export const PRIORITY_RANK: Record<TicketPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

export function ticketPriority(raw: string): TicketPriority {
  if (/urgent|critical|p0|sev.?1/i.test(raw)) return "urgent"
  if (/high|p1|sev.?2/i.test(raw)) return "high"
  if (/low|minor|p3|whenever/i.test(raw)) return "low"
  return "normal"
}

/* ---------------------------------------------------------------- sorting */

export const TICKET_SORTS = ["priority", "newest", "oldest", "due"] as const
export type TicketSort = (typeof TICKET_SORTS)[number]

export const SORT_LABEL: Record<TicketSort, string> = {
  priority: "Priority",
  newest: "Newest first",
  oldest: "Oldest first",
  due: "Due date",
}

export function priorityTone(priority: TicketPriority) {
  if (priority === "urgent") return "bg-bad-soft text-bad"
  if (priority === "high") return "bg-warn-soft text-warn"
  if (priority === "low") return "bg-well text-ink-3"
  return "bg-well text-ink-3"
}

/* ------------------------------------------------------------------ urls */

/**
 * A ticket's address. Smartsheet numbers like `0042-Ticket` become `0042`;
 * anything without a number falls back to the head of its uuid.
 */
export function ticketSlug(t: { number: string; id: string }) {
  const cleaned = t.number
    .replace(/[-_\s]*ticket\s*$/i, "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return cleaned ? cleaned.toUpperCase() : t.id.slice(0, 8)
}

/** Display form of the number — same trim, no slug mangling. */
export function ticketNumber(t: { number: string; id: string }) {
  const cleaned = t.number.replace(/[-_\s]*ticket\s*$/i, "").trim()
  return cleaned || t.id.slice(0, 8)
}

/** ZEM for zemvelo, CF for caps-fieldhouse — the prefix new numbers get. */
export function clientPrefix(slug: string) {
  const words = slug.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (words.length > 1) {
    return words
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase()
  }
  return (words[0] ?? "tk").slice(0, 3).toUpperCase()
}

/* ------------------------------------------------------------------ time */

const HOUR = 60 * 60 * 1000

/** Compact age — 40m, 6h, 3d, 5w. Wide enough for one column, no more. */
export function ageLabel(from: Date | string | null, now = new Date()) {
  if (!from) return ""
  const then = typeof from === "string" ? new Date(from) : from
  const ms = now.getTime() - then.getTime()
  if (!Number.isFinite(ms) || ms < 0) return "now"
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m`
  const hours = Math.floor(ms / HOUR)
  if (hours < 48) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export function ticketOpenedAt(t: {
  submittedOn: string | null
  createdAt: Date
}) {
  if (t.submittedOn) {
    const [y, m, d] = t.submittedOn.split("-").map(Number)
    if (y && m && d) {
      // Prefer createdAt when it falls on the submitted day: it has the clock.
      const day = new Date(y, m - 1, d)
      const created = new Date(t.createdAt)
      const sameDay =
        created.getFullYear() === y &&
        created.getMonth() === m - 1 &&
        created.getDate() === d
      return sameDay ? created : day
    }
  }
  return new Date(t.createdAt)
}

/**
 * Red-age rule: past its due date, or open for more than a day with nobody
 * having replied yet. Closed tickets are never late.
 */
export function isLate(
  t: {
    dueOn: string | null
    firstResponseAt: Date | null
    submittedOn: string | null
    createdAt: Date
    state: string
    status: string
    completed: boolean
  },
  now = new Date()
) {
  if (ticketState(t) === "closed") return false
  if (t.dueOn) {
    const [y, m, d] = t.dueOn.split("-").map(Number)
    if (y && m && d && new Date(y, m - 1, d, 23, 59, 59) < now) return true
  }
  if (!t.firstResponseAt) {
    return now.getTime() - ticketOpenedAt(t).getTime() > 24 * HOUR
  }
  return false
}

export function formatStamp(value: Date | string | null) {
  if (!value) return ""
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/* --------------------------------------------------------------- payloads */

const LANG_LABEL: Record<string, string> = {
  json: "json",
  log: "log",
  sql: "sql",
  ts: "ts",
  tsx: "tsx",
  js: "js",
  php: "php",
  liquid: "liquid",
  csv: "csv",
  diff: "diff",
  html: "html",
  css: "css",
  yaml: "yaml",
  txt: "txt",
}

export function normalizeLang(raw: string | null | undefined, body = "") {
  const lang = String(raw ?? "").toLowerCase().trim()
  if (LANG_LABEL[lang]) return lang
  if (lang === "javascript") return "js"
  if (lang === "typescript") return "ts"
  if (lang === "yml") return "yaml"
  return guessLang(body)
}

/** Best-effort sniff for payloads that arrive without a language. */
export function guessLang(body: string) {
  const head = body.trim().slice(0, 400)
  if (/^[[{]/.test(head)) {
    try {
      JSON.parse(body)
      return "json"
    } catch {
      if (/"\w+"\s*:/.test(head)) return "json"
    }
  }
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b/i.test(head)) return "sql"
  if (/^@@|^\+\+\+|^---/m.test(head)) return "diff"
  if (/^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|^\[\d{2}-\w{3}-\d{4}|\bERROR\b|\bstack trace\b/i.test(head))
    return "log"
  if (/^\s*</.test(head)) return "html"
  if (/\{%|\{\{/.test(head)) return "liquid"
  if (/^<\?php/.test(head)) return "php"
  if (/\b(const|function|=>|import .* from)\b/.test(head)) return "ts"
  if (/^[^\n,]+,[^\n,]+(,|\n)/.test(head)) return "csv"
  return "txt"
}

export function countLines(body: string) {
  if (!body) return 0
  return body.split("\n").length
}

/* --------------------------------------------------------------- exports */

type MarkdownInput = {
  ticket: SupportTicket
  clientName: string | null
  messages: TicketMessage[]
  payloads: TicketPayload[]
}

/** The whole ticket as one paste — for a client mail, a doc, or an agent. */
export function ticketMarkdown({
  ticket,
  clientName,
  messages,
  payloads,
}: MarkdownInput) {
  const state = ticketState(ticket)
  const lines: string[] = []
  lines.push(`# ${ticketNumber(ticket)} — ${ticket.title || "Untitled"}`, "")
  lines.push(`- Client: ${clientName ?? "Unassigned"}`)
  if (ticket.platform) lines.push(`- Platform: ${ticket.platform}`)
  lines.push(`- Source: ${ticket.source}`)
  lines.push(`- State: ${STATE_LABEL[state]} · Priority: ${ticketPriority(ticket.priority)}`)
  if (ticket.submittedBy) lines.push(`- Submitted by: ${ticket.submittedBy}`)
  if (ticket.contactEmail) lines.push(`- Contact: ${ticket.contactEmail}`)
  if (ticket.dueOn) lines.push(`- Due: ${ticket.dueOn}`)
  if (ticket.tags.length) lines.push(`- Tags: ${ticket.tags.join(", ")}`)
  lines.push("")
  if (ticket.description) lines.push("## Description", "", ticket.description, "")
  if (ticket.resolution) lines.push("## Resolution", "", ticket.resolution, "")
  if (messages.length) {
    lines.push("## Thread", "")
    for (const m of messages) {
      lines.push(`**${m.author || m.role}** · ${formatStamp(m.sentAt)}`, "", m.body, "")
    }
  }
  if (payloads.length) {
    lines.push("## Payloads", "")
    for (const p of payloads) {
      lines.push(`### ${p.label || "Payload"}`, "", "```" + p.lang, p.body, "```", "")
    }
  }
  const env = ticketEnv(ticket)
  const envKeys = Object.keys(env)
  if (envKeys.length) {
    lines.push("## Environment", "")
    lines.push("| Field | Value |", "| --- | --- |")
    for (const k of envKeys) lines.push(`| ${k} | ${env[k]} |`)
    lines.push("")
  }
  return lines.join("\n")
}

/**
 * Environment facts live in `raw.env` for API-sourced tickets; Smartsheet rows
 * get whatever columns it sent. Both render in the same table.
 */
export function ticketEnv(ticket: SupportTicket): Record<string, string> {
  const raw = (ticket.raw ?? {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  const env = raw.env
  if (env && typeof env === "object" && !Array.isArray(env)) {
    for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
      if (v == null || v === "") continue
      out[k] = typeof v === "string" ? v : JSON.stringify(v)
    }
  }
  if (typeof raw.url === "string" && raw.url) out.URL = raw.url
  if (typeof raw.userAgent === "string" && raw.userAgent) out["User agent"] = raw.userAgent
  if (ticket.requestType) out["Request type"] = ticket.requestType
  if (ticket.department) out.Department = ticket.department
  if (ticket.customerContact) out["Customer contact"] = ticket.customerContact
  if (ticket.externalId && ticket.source === "smartsheet") out["Smartsheet row"] = ticket.externalId
  return out
}
