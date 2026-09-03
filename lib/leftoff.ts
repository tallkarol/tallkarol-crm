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
  /** How far back the board looks. Nothing is deleted; older rows are history. */
  boardWindowDays: 14,
  /** The note's own prompt / reply line is clipped to this many characters. */
  maxText: 400,
  maxBody: 2000,
  /** A stored message keeps this much of a prompt (from the start)… */
  maxMessagePrompt: 6000,
  /** …and this much of a reply (from the end — the answer is at the end). */
  maxMessageReply: 3000,
  /** A running-agent entry older than this is a lost SubagentStop, not a live agent. */
  agentStaleHours: 6,
  /** Each line of a Done / Blocked on / Next handoff is clipped to this. */
  maxHandoffLine: 300,
} as const

export const SURFACES = ["claude", "cursor", "manual", "browser", "agent", "repo"] as const
export type Surface = (typeof SURFACES)[number]

export const STORED_STATES = ["working", "waiting", "blocked", "gone"] as const
export type StoredState = (typeof STORED_STATES)[number]
export type NoteState = StoredState | "parked"

export const BROWSER_REF = "browser:chrome"
export const SAFARI_REF = "browser:safari"
/** Every browser the tab snapshot knows, in the order the board shows them. */
export const BROWSER_REFS = [BROWSER_REF, SAFARI_REF] as const
/** Firefox is deliberately not captured — Karol does not use it. */
export const BROWSER_NAMES: Record<string, string> = {
  [BROWSER_REF]: "Chrome",
  [SAFARI_REF]: "Safari",
}

/**
 * A working copy with uncommitted work, one self-overwriting row per repo:
 * `git:/Users/…/Work/tallkarol/dev`. Written by the sweep for every repo it
 * knows and by a chat's own hooks for the repo that chat is sitting in, so a
 * repo shows up whether or not a conversation is open on it.
 */
export const REPO_PREFIX = "git:"

export function repoRef(path: string) {
  return `${REPO_PREFIX}${path.replace(/\/+$/, "")}`
}

export function isRepoRef(ref: string) {
  return ref.startsWith(REPO_PREFIX)
}

export function repoPathFromRef(ref: string) {
  return isRepoRef(ref) ? ref.slice(REPO_PREFIX.length) : ""
}

export function isBrowserRef(ref: string) {
  return (BROWSER_REFS as readonly string[]).includes(ref)
}

/** Every hook event the POST accepts, Claude Code's and Cursor's names alike. */
export const LEFTOFF_EVENTS = [
  "UserPromptSubmit",
  "Stop",
  "Notification",
  "SessionEnd",
  "SubagentStart",
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
  SubagentStart: null,
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

/** The three-line post-it a chat (or a lane agent) ends its turn with. */
export type Handoff = { done: string; blocked: string; next: string }
/** Subagents running under a chat right now, from `meta.agents`. */
export type AgentsView = { running: number; types: string[]; since: string | null }
/** A SubagentStart / SubagentStop / SessionEnd, as the hook reports it. */
export type AgentEvent = { id: string; type: string; op: "start" | "stop" | "clear"; description?: string }

const MIN = 60_000
const HOUR = 60 * MIN

export function deriveState(n: NoteFacts, now: Date): NoteState {
  const stored = (STORED_STATES as readonly string[]).includes(n.state)
    ? (n.state as StoredState)
    : "waiting"
  // A post-it has no process behind it; it is simply there. Neither has a
  // repo row: uncommitted work is a standing fact, never "parked".
  if (n.surface === "manual" || n.surface === "browser" || n.surface === "repo") return "waiting"
  // An agent lane waits for a pick; it is not parked by the clock. Only a
  // lane left "working" ages out, like a chat that lost its Stop.
  if (n.surface === "agent" && stored !== "working" && stored !== "gone") return "waiting"
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

/* --------------------------------------------------------------- messages */

/**
 * Which half of a turn an event carries, or null when it carries none.
 * A chat can answer twice for one prompt — Claude's Stop hook returns
 * `decision: block` to deliver a reply from the board, so the agent runs on
 * and Stops again; Cursor's `afterAgentResponse` fires per response before its
 * `stop`. Every one of those is its own assistant message, never an overwrite.
 */
export function messageRole(event: LeftOffEvent): MessageRole | null {
  if (event === "UserPromptSubmit" || event === "beforeSubmitPrompt") return "user"
  if (event === "Stop" || event === "stop" || event === "afterAgentResponse") return "assistant"
  return null
}

export const MESSAGE_ROLES = ["user", "assistant"] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

export function isMessageRole(value: unknown): value is MessageRole {
  return value === "user" || value === "assistant"
}

/**
 * Message text keeps its shape — `clip()` flattens whitespace because a note
 * is one line in a list, but a stored message is read as itself. A prompt is
 * cut from the end (you said the ask first); a reply is cut from the front
 * (the agent answers last).
 */
export function clipHead(text: string, max: number) {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

export function clipTail(text: string, max: number) {
  const trimmed = text.trim()
  return trimmed.length > max ? `…${trimmed.slice(trimmed.length - max + 1)}` : trimmed
}

/** The text a message row stores for this event, already clipped. */
export function messageText(event: LeftOffEvent, prompt: string, reply: string) {
  const role = messageRole(event)
  if (!role) return ""
  return role === "user"
    ? clipHead(prompt, LEFTOFF_RULES.maxMessagePrompt)
    : clipTail(reply, LEFTOFF_RULES.maxMessageReply)
}

/** Post-its, browser snapshots and repo rows are not conversations. */
export function keepsMessages(surface: string) {
  return surface !== "manual" && surface !== "browser" && surface !== "repo"
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
  handoff: Handoff | null
  agents: AgentsView | null
  /** Set only on `surface: "repo"` rows. */
  repo: RepoView | null
}

export type BrowserTab = { title: string; url: string; active: boolean }
export type BrowserWindow = { title: string; tabs: BrowserTab[] }
export type BrowserSnapshot = {
  /** "Chrome" | "Safari" — which browser this snapshot came from. */
  browser: string
  capturedAt: string
  windows: BrowserWindow[]
}

/**
 * Uncommitted work in one repo. Counts only, never diff bodies: a diff would
 * carry .env files and client code into the CRM.
 */
export type RepoView = {
  path: string
  /** Tracked files changed, staged or not. */
  changed: number
  /** Files git does not know about yet. */
  untracked: number
  /** changed + untracked — what the row's title counts. */
  dirty: number
  ahead: number
  behind: number
  stashes: number
  /** A few paths, for the row's second line. Never contents. */
  files: string[]
}

export type LeftOffCounts = { working: number; waiting: number; blocked: number; parked: number }

export type LeftOffPayload = {
  generatedAt: string
  notes: LeftOffNoteView[]
  counts: LeftOffCounts
  /**
   * The Chrome snapshot. Kept as its own field because the Mac app and the
   * board already read it; `browsers` is the full list.
   */
  browser: BrowserSnapshot | null
  /** Every browser captured, newest snapshot each. */
  browsers: BrowserSnapshot[]
  /** Repos with uncommitted work. Also present in `notes` as `surface: "repo"`. */
  repos: LeftOffNoteView[]
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
    handoff: readHandoff(n.meta),
    agents: readAgents(n.meta, now, n.state),
    repo: readRepo(n),
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
    // A repo row must not pull its client group up the board: uncommitted
    // work is background, and the group's urgency comes from its chats.
    if (v.surface === "repo") continue
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
    // Inside a group the chats come first and the repos sit under them.
    const ar = a.surface === "repo" ? 1 : 0
    const br = b.surface === "repo" ? 1 : 0
    if (ar !== br) return ar - br
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (ar === 1) {
      // Repos: the dirtiest first, then by name, so the order is stable.
      const da = a.repo?.dirty ?? 0
      const db = b.repo?.dirty ?? 0
      if (da !== db) return db - da
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
    }
    const rank = STATE_RANK[a.state] - STATE_RANK[b.state]
    if (rank !== 0) return rank
    return a.eventAt < b.eventAt ? 1 : a.eventAt > b.eventAt ? -1 : 0
  })
}

function handoffLine(value: unknown) {
  return typeof value === "string" ? clip(value, LEFTOFF_RULES.maxHandoffLine) : ""
}

/**
 * `meta.handoff` as the hook stored it — validated, never parsed from prose
 * (the hook is the one parser). A JSON null, a non-object, or a block with
 * neither Done nor Next all read as "no handoff".
 */
export function readHandoff(meta: Record<string, unknown>): Handoff | null {
  const raw = meta.handoff
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const h = raw as Record<string, unknown>
  const out = { done: handoffLine(h.done), blocked: handoffLine(h.blocked), next: handoffLine(h.next) }
  return out.done || out.next ? out : null
}

/**
 * `meta.agents` is `{ <agent_id>: { type, since, description? } }`, kept by
 * the server as commutative set operations. An entry older than
 * `agentStaleHours` is a lost SubagentStop and is not counted; a gone chat
 * has no live agents whatever the row says.
 */
export function readAgents(meta: Record<string, unknown>, now: Date, state: string): AgentsView | null {
  if (state === "gone") return null
  const raw = meta.agents
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const live: { id: string; type: string; since: number }[] = []
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue
    const e = v as Record<string, unknown>
    const since = typeof e.since === "string" ? new Date(e.since).getTime() : NaN
    if (Number.isNaN(since)) continue
    if (now.getTime() - since > LEFTOFF_RULES.agentStaleHours * HOUR) continue
    live.push({ id, type: typeof e.type === "string" && e.type ? e.type : "agent", since })
  }
  if (!live.length) return null
  live.sort((a, b) => a.since - b.since || (a.id < b.id ? -1 : 1))
  const types: string[] = []
  for (const a of live) if (!types.includes(a.type) && types.length < 3) types.push(a.type)
  return { running: live.length, types, since: new Date(live[0].since).toISOString() }
}

function readBrowser(n: NoteFacts | undefined): BrowserSnapshot | null {
  if (!n || n.dismissedAt) return null
  const windows = Array.isArray(n.meta.windows) ? (n.meta.windows as BrowserWindow[]) : []
  if (!windows.length) return null
  return {
    browser: BROWSER_NAMES[n.sessionRef] ?? "Browser",
    capturedAt: n.eventAt.toISOString(),
    windows,
  }
}

function intAt(meta: Record<string, unknown>, key: string) {
  const v = meta[key]
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
}

/** The repo facts a `git:` row carries in its meta; null on every other row. */
function readRepo(n: NoteFacts): RepoView | null {
  if (n.surface !== "repo") return null
  const changed = intAt(n.meta, "changed")
  const untracked = intAt(n.meta, "untracked")
  const files = Array.isArray(n.meta.files)
    ? (n.meta.files as unknown[]).filter((f): f is string => typeof f === "string").slice(0, 20)
    : []
  return {
    path: repoPathFromRef(n.sessionRef) || n.cwd,
    changed,
    untracked,
    dirty: changed + untracked,
    ahead: intAt(n.meta, "ahead"),
    behind: intAt(n.meta, "behind"),
    stashes: intAt(n.meta, "stashes"),
    files,
  }
}

/** The widget/dashboard payload from raw rows — the browser row is split out. */
export function buildPayload(rows: NoteFacts[], now: Date): LeftOffPayload {
  const browserRows = rows.filter((r) => r.surface === "browser" || isBrowserRef(r.sessionRef))
  const notes = sortViews(
    rows
      .filter((r) => !browserRows.includes(r))
      .filter((r) => isVisible(r, now))
      .map((r) => toView(r, now))
  )
  const counts: LeftOffCounts = { working: 0, waiting: 0, blocked: 0, parked: 0 }
  for (const n of notes) {
    // A post-it and a repo row are standing facts, not chats waiting on you;
    // counting them would inflate "2 parked, 1 blocked".
    if (n.surface === "manual" || n.surface === "repo") continue
    if (n.state in counts) counts[n.state as keyof LeftOffCounts] += 1
  }
  const browsers = BROWSER_REFS.map((ref) =>
    readBrowser(browserRows.find((r) => r.sessionRef === ref))
  ).filter((b): b is BrowserSnapshot => b !== null)
  return {
    generatedAt: now.toISOString(),
    notes,
    counts,
    browser: readBrowser(browserRows.find((r) => r.sessionRef === BROWSER_REF)),
    browsers,
    repos: notes.filter((n) => n.surface === "repo"),
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
