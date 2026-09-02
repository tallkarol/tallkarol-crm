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
}

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
  }
}

export function sortViews(views: LeftOffNoteView[]) {
  return [...views].sort((a, b) => {
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
