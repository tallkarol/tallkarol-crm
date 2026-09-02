/**
 * Where I left off — the pure half.
 *
 * A note is one row per agent conversation, overwritten by that
 * conversation's own hooks. What the hook writes is the *stored* state
 * (working | waiting | blocked | gone). Everything time-based — "parked",
 * whether a row is still worth showing, the band it sorts into — is derived
 * here from `eventAt` and `now`, never stored, so the menu bar, the widget and
 * the dashboard cannot disagree and the thresholds can change without a
 * backfill. Same shape as `lib/attention.ts`; `npm run check:leftoff`.
 *
 * No db import: `lib/leftoff-data.ts` is the db half.
 */

export const LEFTOFF_RULES = {
  /** A chat waiting on you for this long is "parked". */
  parkedAfterMin: 30,
  /** A chat still "working" after this long lost its Stop — treat as parked. */
  lostStopHours: 2,
  /** No hook for this long: the process is presumed gone (laptop died). */
  presumedGoneHours: 24,
  /** A finished chat stays on the list this long, then hides. */
  hideGoneAfterHours: 12,
  /** Hidden rows are deleted after this. Pinned and manual notes never are. */
  purgeAfterDays: 14,
  /** Prompt / reply text is clipped to this many characters on the way in. */
  maxText: 400,
  maxBody: 2000,
} as const

export const SURFACES = ["claude", "cursor", "manual", "browser"] as const
export type Surface = (typeof SURFACES)[number]

export const STORED_STATES = ["working", "waiting", "blocked", "gone"] as const
export type StoredState = (typeof STORED_STATES)[number]
export type NoteState = StoredState | "parked"

export const BROWSER_REF = "browser:chrome"

/** Every hook event the POST accepts, Claude Code's and Cursor's names alike. */
export const LEFTOFF_EVENTS = [
  "UserPromptSubmit",
  "Stop",
  "Notification",
  "SessionEnd",
  "SubagentStop",
  "beforeSubmitPrompt",
  "afterAgentResponse",
  "stop",
  "sessionEnd",
  "gone",
  "note",
  "snapshot",
  "touch",
] as const
export type LeftOffEvent = (typeof LEFTOFF_EVENTS)[number]

/** The stored state an event writes; null = touch `eventAt` only. */
const EVENT_STATE: Record<LeftOffEvent, StoredState | null> = {
  UserPromptSubmit: "working",
  beforeSubmitPrompt: "working",
  afterAgentResponse: "working",
  Stop: "waiting",
  stop: "waiting",
  Notification: "blocked",
  SessionEnd: "gone",
  sessionEnd: "gone",
  gone: "gone",
  SubagentStop: null,
  touch: null,
  note: null,
  snapshot: null,
}

/**
 * Claude Code's Notification hook fires for several reasons; only a
 * permission prompt means the chat is blocked on you. An idle prompt means
 * it finished and is waiting; anything else is not a state change.
 */
export function eventState(event: LeftOffEvent, notificationType?: string | null): StoredState | null {
  if (event !== "Notification") return EVENT_STATE[event]
  if (notificationType === "permission_prompt") return "blocked"
  if (notificationType === "idle_prompt") return "waiting"
  return null
}

export function isLeftOffEvent(value: unknown): value is LeftOffEvent {
  return typeof value === "string" && (LEFTOFF_EVENTS as readonly string[]).includes(value)
}

export function isSurface(value: unknown): value is Surface {
  return typeof value === "string" && (SURFACES as readonly string[]).includes(value)
}

/* ------------------------------------------------------------- derivation */

export type NoteFacts = {
  sessionRef: string
  surface: string
  title: string
  project: string
  cwd: string
  branch: string
  lastPrompt: string
  lastReply: string
  state: string
  body: string
  pinned: boolean
  eventAt: Date
  startedAt: Date | null
  endedAt: Date | null
  dismissedAt: Date | null
  meta: Record<string, unknown>
  /** What a blocked chat is waiting to be allowed to do. */
  blockedOn?: string
  /** A reply queued from the board, not yet delivered by the chat's hooks. */
  reply?: string
  taskId?: string | null
  ticketId?: string | null
  client?: LeftOffClient | null
}

export type LeftOffClient = { slug: string; name: string; color: string }

const MIN = 60_000
const HOUR = 60 * MIN

export function deriveState(n: NoteFacts, now: Date): NoteState {
  const stored = (STORED_STATES as readonly string[]).includes(n.state)
    ? (n.state as StoredState)
    : "waiting"
  // A post-it has no process behind it; it is simply there.
  if (n.surface === "manual" || n.surface === "browser") return "waiting"
  if (stored === "gone") return "gone"
  const age = now.getTime() - n.eventAt.getTime()
  if (stored === "working") {
    return age > LEFTOFF_RULES.lostStopHours * HOUR ? "parked" : "working"
  }
  if (age > LEFTOFF_RULES.parkedAfterMin * MIN) return "parked"
  return stored
}

/** Still worth a row? Dismissed never; finished chats fade; notes stay. */
export function isVisible(n: NoteFacts, now: Date): boolean {
  if (n.dismissedAt) return false
  if (n.pinned || n.body.trim() !== "") return true
  if (n.state !== "gone") return true
  if (!n.endedAt) return false
  return now.getTime() - n.endedAt.getTime() < LEFTOFF_RULES.hideGoneAfterHours * HOUR
}

export const STATE_RANK: Record<NoteState, number> = {
  blocked: 0,
  parked: 1,
  waiting: 2,
  working: 3,
  gone: 4,
}

export const STATE_LABEL: Record<NoteState, string> = {
  blocked: "Needs a yes",
  parked: "Parked",
  waiting: "Waiting on you",
  working: "Working",
  gone: "Done",
}

export function minutesAgo(at: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / MIN))
}

export function agoLabel(at: Date, now: Date) {
  const m = minutesAgo(at, now)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function projectFromCwd(cwd: string) {
  const trimmed = cwd.replace(/\/+$/, "")
  const last = trimmed.slice(trimmed.lastIndexOf("/") + 1)
  return last
}

function shellQuote(path: string) {
  return `'${path.replace(/'/g, `'\\''`)}'`
}

/** Only Claude Code sessions can be resumed by id; Cursor chats are opened by workspace. */
export function resumeCommand(n: Pick<NoteFacts, "sessionRef" | "surface" | "cwd">) {
  if (n.surface !== "claude") return ""
  const id = n.sessionRef.replace(/^claude:/, "")
  if (!/^[A-Za-z0-9-]{8,}$/.test(id)) return ""
  return n.cwd ? `cd ${shellQuote(n.cwd)} && claude --resume ${id}` : `claude --resume ${id}`
}

export function clip(text: string, max: number = LEFTOFF_RULES.maxText) {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/* ---------------------------------------------------------------- payload */

export type LeftOffNoteView = {
  sessionRef: string
  surface: string
  title: string
  project: string
  cwd: string
  branch: string
  state: NoteState
  lastPrompt: string
  lastReply: string
  body: string
  pinned: boolean
  eventAt: string
  ago: string
  resumeCommand: string
  openPath: string
  client: LeftOffClient | null
  blockedOn: string
  pendingReply: string
  taskId: string | null
  ticketId: string | null
}

export type BrowserTab = { title: string; url: string; active: boolean }
export type BrowserWindow = { title: string; tabs: BrowserTab[] }
export type BrowserSnapshot = { capturedAt: string; windows: BrowserWindow[] }

export type LeftOffCounts = { working: number; waiting: number; blocked: number; parked: number }

export type LeftOffPayload = {
  generatedAt: string
  notes: LeftOffNoteView[]
  counts: LeftOffCounts
  browser: BrowserSnapshot | null
}

export function toView(n: NoteFacts, now: Date): LeftOffNoteView {
  return {
    sessionRef: n.sessionRef,
    surface: n.surface,
    title: n.title || (n.body ? clip(n.body, 80) : "") || n.project || "Untitled",
    project: n.project,
    cwd: n.cwd,
    branch: n.branch,
    state: deriveState(n, now),
    lastPrompt: n.lastPrompt,
    lastReply: n.lastReply,
    body: n.body,
    pinned: n.pinned,
    eventAt: n.eventAt.toISOString(),
    ago: agoLabel(n.eventAt, now),
    resumeCommand: resumeCommand(n),
    openPath: n.cwd,
    client: n.client ?? null,
    blockedOn: n.blockedOn ?? "",
    pendingReply: n.reply ?? "",
    taskId: n.taskId ?? null,
    ticketId: n.ticketId ?? null,
  }
}

/**
 * Client groups first — that is how the day is actually switched between —
 * with the house / unattributed group last. Inside a group: pinned, then the
 * state band, then newest. Groups are ordered by their most urgent note so a
 * client with something blocked rises to the top.
 */
export function sortViews(views: LeftOffNoteView[]) {
  const groupRank = new Map<string, number>()
  for (const v of views) {
    const key = v.client?.slug ?? ""
    const rank = STATE_RANK[v.state] - (v.pinned ? 1 : 0)
    groupRank.set(key, Math.min(groupRank.get(key) ?? 99, rank))
  }
  return [...views].sort((a, b) => {
    const ka = a.client?.slug ?? ""
    const kb = b.client?.slug ?? ""
    if (ka !== kb) {
      if (!ka) return 1
      if (!kb) return -1
      const ra = groupRank.get(ka) ?? 99
      const rb = groupRank.get(kb) ?? 99
      if (ra !== rb) return ra - rb
      return ka < kb ? -1 : 1
    }
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const rank = STATE_RANK[a.state] - STATE_RANK[b.state]
    if (rank !== 0) return rank
    return a.eventAt < b.eventAt ? 1 : a.eventAt > b.eventAt ? -1 : 0
  })
}

function readBrowser(n: NoteFacts | undefined): BrowserSnapshot | null {
  if (!n || n.dismissedAt) return null
  const windows = Array.isArray(n.meta.windows) ? (n.meta.windows as BrowserWindow[]) : []
  if (!windows.length) return null
  return { capturedAt: n.eventAt.toISOString(), windows }
}

/** The widget/dashboard payload from raw rows — the browser row is split out. */
export function buildPayload(rows: NoteFacts[], now: Date): LeftOffPayload {
  const browserRow = rows.find((r) => r.sessionRef === BROWSER_REF || r.surface === "browser")
  const notes = sortViews(
    rows
      .filter((r) => r !== browserRow && r.surface !== "browser")
      .filter((r) => isVisible(r, now))
      .map((r) => toView(r, now))
  )
  const counts: LeftOffCounts = { working: 0, waiting: 0, blocked: 0, parked: 0 }
  for (const n of notes) {
    if (n.surface === "manual") continue
    if (n.state in counts) counts[n.state as keyof LeftOffCounts] += 1
  }
  return {
    generatedAt: now.toISOString(),
    notes,
    counts,
    browser: readBrowser(browserRow),
  }
}

/* --------------------------------------------------------------- briefing */

export type BriefingInput = {
  now: Date
  /** Start of the window being reported on — the last briefing, or 12 h ago. */
  since: Date
  notes: NoteFacts[]
  /** Agent sessions that ended in the window, from `agent_sessions`. */
  finishedSessions: { sessionRef: string; name: string; client: string }[]
  newTickets: number
}

export type Briefing = {
  title: string
  /** One line for the push / the menu bar. */
  body: string
  /** One line per section for the notification and the band. */
  lines: string[]
  counts: { parked: number; blocked: number; finished: number; presumedGone: number; newTickets: number }
}

function named(n: NoteFacts) {
  const title = n.title || n.project || "untitled"
  return n.client ? `${title} (${n.client.name})` : title
}

function joinNames(items: string[], max = 4) {
  if (items.length <= max) return items.join(", ")
  return `${items.slice(0, max).join(", ")} +${items.length - max}`
}

/** What happened while you were away, in the order you should read it. */
export function buildBriefing(input: BriefingInput): Briefing {
  const { now, since } = input
  const live = input.notes.filter((n) => !n.dismissedAt && n.surface !== "browser" && n.surface !== "manual")
  const blocked = live.filter((n) => deriveState(n, now) === "blocked")
  const parked = live.filter((n) => deriveState(n, now) === "parked")
  const gone = live.filter((n) => n.state === "gone" && n.endedAt && n.endedAt >= since)
  const presumed = gone.filter((n) => n.meta.presumed === true)
  const finishedNotes = gone.filter((n) => n.meta.presumed !== true)
  const seen = new Set(finishedNotes.map((n) => n.sessionRef))
  const finishedAgents = input.finishedSessions.filter((f) => !seen.has(f.sessionRef))
  const finished = [
    ...finishedNotes.map(named),
    ...finishedAgents.map((f) => (f.client ? `${f.name || f.sessionRef} (${f.client})` : f.name || f.sessionRef)),
  ]

  const lines: string[] = []
  if (blocked.length) lines.push(`Blocked on you: ${joinNames(blocked.map((n) => `${named(n)}${n.blockedOn ? " — " + n.blockedOn : ""}`), 3)}`)
  if (parked.length) lines.push(`Parked: ${joinNames(parked.map(named))}`)
  if (finished.length) lines.push(`Finished while you were away: ${joinNames(finished)}`)
  if (presumed.length) lines.push(`Presumed gone (no word for a day): ${joinNames(presumed.map(named))}`)
  if (input.newTickets) lines.push(`New tickets: ${input.newTickets}`)

  const parts: string[] = []
  if (blocked.length) parts.push(`${blocked.length} blocked`)
  if (parked.length) parts.push(`${parked.length} parked`)
  if (finished.length) parts.push(`${finished.length} finished`)
  if (presumed.length) parts.push(`${presumed.length} presumed gone`)
  if (input.newTickets) parts.push(`${input.newTickets} new ${input.newTickets === 1 ? "ticket" : "tickets"}`)

  return {
    title: "Morning briefing",
    body: parts.length ? parts.join(" · ") : "Nothing waiting. Clean desk.",
    lines,
    counts: {
      parked: parked.length,
      blocked: blocked.length,
      finished: finished.length,
      presumedGone: presumed.length,
      newTickets: input.newTickets,
    },
  }
}

/** yyyy-mm-dd in the workspace's own zone — the briefing's dedupe key. */
export function localDay(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

export function localHourMinute(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0")
  return { hour: get("hour") % 24, minute: get("minute") }
}
