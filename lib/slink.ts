/**
 * slink — the pure half.
 *
 * A slink is one durable page shared with named people. There is no password
 * anywhere: access is a magic link per email address, so nothing has to travel
 * a second channel and every open is attributable to one person.
 *
 * Three clocks, deliberately separate. Collapsing them is how a feature like
 * this leaks:
 *
 *   token    15 min, single use  — getting in once
 *   session  30 days, capped by the grant — staying in
 *   grant    24 h by default, or never — whether that email may get in at all
 *
 * The token is a doorknob; the grant is the key. A grant lapsing revokes a
 * person, never the page — the blocks and the history stay put and re-sharing
 * is one button.
 *
 * No db import: `lib/slink-data.ts` is the db half. `npm run check:slink`.
 */

export const SLINK_RULES = {
  /** A magic link is good for this long, once. */
  tokenTtlMin: 15,
  /** Default grant when Karol does not say otherwise. */
  defaultGrantHours: 24,
  /**
   * The longest a cookie may live. An indefinite grant still ages out here —
   * a fresh link is one click away, and a browser that keeps a session alive
   * forever is a credential nobody can take back.
   */
  maxSessionDays: 30,
  /** Failed token exchanges from one address before it stops being served. */
  maxFailedExchanges: 10,
  /** Access requests one IP may file against one slink per hour. */
  maxRequestsPerHour: 5,
  /** Longest free-text reason on an access request. */
  maxReason: 600,
  maxTitle: 200,
  maxIntro: 4000,
} as const

export const SLINK_STATUSES = ["active", "archived"] as const
export type SlinkStatus = (typeof SLINK_STATUSES)[number]

/**
 * Static kinds carry their own payload. Live kinds carry a pointer and are read
 * fresh on every view, so what was shared stays current instead of ageing into
 * a lie the moment it is sent.
 */
export const STATIC_BLOCK_KINDS = ["text", "table", "fields", "file", "link"] as const
export const LIVE_BLOCK_KINDS = ["credential", "punchlist", "reports", "dashboard"] as const
export const BLOCK_KINDS = [...STATIC_BLOCK_KINDS, ...LIVE_BLOCK_KINDS] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]

export function isBlockKind(value: unknown): value is BlockKind {
  return typeof value === "string" && (BLOCK_KINDS as readonly string[]).includes(value)
}

export function isLiveKind(kind: string) {
  return (LIVE_BLOCK_KINDS as readonly string[]).includes(kind)
}

/** Credential blocks are watermarked with the viewer's address; nothing else is. */
export function isWatermarked(kind: string) {
  return kind === "credential"
}

export const BLOCK_LABEL: Record<BlockKind, string> = {
  text: "Text",
  table: "Table",
  fields: "Fields",
  file: "File",
  link: "Link",
  credential: "Credential",
  punchlist: "Punch list",
  reports: "Reports",
  dashboard: "Dashboard",
}

export const REQUEST_STATUSES = ["pending", "granted", "denied"] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const SLINK_EVENT_KINDS = [
  "created",
  "invited",
  "link_sent",
  "opened",
  "viewed",
  "revealed",
  "downloaded",
  "access_requested",
  "access_granted",
  "access_denied",
  "expired",
  "revoked",
  "archived",
] as const
export type SlinkEventKind = (typeof SLINK_EVENT_KINDS)[number]

export const EVENT_LABEL: Record<SlinkEventKind, string> = {
  created: "created the slink",
  invited: "was invited",
  link_sent: "was sent a fresh link",
  opened: "opened the slink",
  viewed: "viewed a block",
  revealed: "revealed a credential",
  downloaded: "downloaded a file",
  access_requested: "asked for access",
  access_granted: "was granted access",
  access_denied: "was denied access",
  expired: "access expired",
  revoked: "access was revoked",
  archived: "slink archived",
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/* ------------------------------------------------------------- identifiers */

const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"

/**
 * The URL handle. Unguessable and never sequential, but this is not the
 * secret — the magic link is. A slug alone opens nothing.
 */
export function makePublicId(random: (n: number) => Uint8Array, words: string[] = []) {
  const stem = words
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
  const bytes = random(6)
  let tail = ""
  for (let i = 0; i < bytes.length; i += 1) {
    tail += ID_ALPHABET[bytes[i] % ID_ALPHABET.length]
  }
  return stem ? `${stem}-${tail}` : tail
}

export function isPublicId(value: string) {
  return /^[a-z0-9-]{4,48}$/.test(value)
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 320)
}

export function isEmail(value: string) {
  const v = normalizeEmail(value)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

/* ------------------------------------------------------------------ grants */

export type GrantFacts = {
  expiresAt: Date | null
  revokedAt: Date | null
}

export type GrantState = "active" | "indefinite" | "expired" | "revoked"

/** What a recipient's row means right now. `null` expiry is the toggle. */
export function grantState(r: GrantFacts, now: Date): GrantState {
  if (r.revokedAt) return "revoked"
  if (!r.expiresAt) return "indefinite"
  return r.expiresAt.getTime() > now.getTime() ? "active" : "expired"
}

export function grantAllows(r: GrantFacts, now: Date) {
  const state = grantState(r, now)
  return state === "active" || state === "indefinite"
}

/** Hours from now, or null for a grant that never lapses. */
export function grantExpiry(hours: number | null, now: Date): Date | null {
  if (hours === null) return null
  const safe = Number.isFinite(hours) && hours > 0 ? hours : SLINK_RULES.defaultGrantHours
  return new Date(now.getTime() + safe * HOUR)
}

/**
 * A session may never outlive its grant. An indefinite grant still stops at
 * the 30-day cap, because a cookie that never dies is a credential that cannot
 * be taken back.
 */
export function sessionExpiry(grant: GrantFacts, now: Date): Date {
  const cap = new Date(now.getTime() + SLINK_RULES.maxSessionDays * DAY)
  if (!grant.expiresAt) return cap
  return grant.expiresAt.getTime() < cap.getTime() ? grant.expiresAt : cap
}

export function tokenExpiry(now: Date): Date {
  return new Date(now.getTime() + SLINK_RULES.tokenTtlMin * MIN)
}

export function tokenUsable(
  t: { expiresAt: Date; usedAt: Date | null },
  now: Date
) {
  return !t.usedAt && t.expiresAt.getTime() > now.getTime()
}

/* -------------------------------------------------------------- formatting */

/** "21h 40m", "6 days", "in a moment" — what a recipient sees on the banner. */
export function timeLeftLabel(expiresAt: Date | null, now: Date) {
  if (!expiresAt) return "Access does not expire"
  const ms = expiresAt.getTime() - now.getTime()
  if (ms <= 0) return "Access has expired"
  const mins = Math.floor(ms / MIN)
  if (mins < 60) return `Access expires in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    const rest = mins % 60
    return rest ? `Access expires in ${hours}h ${rest}m` : `Access expires in ${hours}h`
  }
  const days = Math.round(hours / 24)
  return `Access expires in ${days} day${days === 1 ? "" : "s"}`
}

export function agoLabel(at: Date, now: Date) {
  const mins = Math.max(0, Math.floor((now.getTime() - at.getTime()) / MIN))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/* ------------------------------------------------------------ block shapes */

export type TableData = { columns: string[]; rows: string[][] }
export type FieldsData = { fields: { label: string; value: string }[] }
export type LinkData = { url: string; label: string }

export function readTable(data: unknown): TableData {
  const d = (data ?? {}) as Record<string, unknown>
  const columns = Array.isArray(d.columns)
    ? d.columns.filter((c): c is string => typeof c === "string")
    : []
  const rows = Array.isArray(d.rows)
    ? d.rows
        .filter((r): r is unknown[] => Array.isArray(r))
        .map((r) => r.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))))
    : []
  return { columns, rows }
}

export function readFields(data: unknown): FieldsData {
  const d = (data ?? {}) as Record<string, unknown>
  const raw = Array.isArray(d.fields) ? d.fields : []
  const fields = raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      label: typeof f.label === "string" ? f.label : "",
      value: typeof f.value === "string" ? f.value : "",
    }))
    .filter((f) => f.label || f.value)
  return { fields }
}

export function readLink(data: unknown): LinkData {
  const d = (data ?? {}) as Record<string, unknown>
  const url = typeof d.url === "string" ? d.url : ""
  const label = typeof d.label === "string" && d.label ? d.label : url
  return { url, label }
}

/** Only http(s) leaves the page. A `javascript:` label never becomes a link. */
export function safeHref(url: string) {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : ""
}

/* --------------------------------------------------------------- csv */

/** Table blocks offer "copy as CSV"; this is the same text the button yields. */
export function toCsv(table: TableData) {
  const esc = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  return [table.columns, ...table.rows].map((row) => row.map(esc).join(",")).join("\n")
}

/* ------------------------------------------------------------------ views */

export type SlinkRecipientView = {
  id: string
  email: string
  name: string
  state: GrantState
  expiresAt: string | null
  timeLeft: string
  lastSeen: string
  viewCount: number
}

export type SlinkCounts = {
  people: number
  active: number
  expired: number
  pendingRequests: number
}

/* ---------------------------------------------------------------- parsing */

/**
 * Tables are pasted, not built cell by cell — a DNS zone or a bank detail is
 * already in a spreadsheet or a terminal somewhere. First line is the header;
 * tabs or two-or-more spaces separate columns.
 */
export function parseTable(raw: string) {
 const lines = raw.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim())
 if (!lines.length) return { columns: [], rows: [] }
 const split = (line: string) =>
 line.includes("\t") ? line.split("\t").map((c) => c.trim()) : line.split(/\s{2,}/).map((c) => c.trim())
 const columns = split(lines[0])
 const rows = lines.slice(1).map(split)
 return { columns, rows }
}

/**"Routing: 021000021" per line — the shape ACH details already arrive in. */
export function parseFields(raw: string) {
 const fields = raw
 .split(/\r?\n/)
 .map((line) => line.trim())
 .filter(Boolean)
 .map((line) => {
 const at = line.indexOf(":")
 if (at === -1) return { label: line, value:"" }
 return { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() }
 })
 .filter((f) => f.label || f.value)
 return { fields }
}
