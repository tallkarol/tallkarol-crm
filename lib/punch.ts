import type { TimePunch } from "@/db/schema"
import { pad2 } from "@/lib/timesheet"

/**
 * Punches are stored as real timestamps; the timesheet stores a plain day plus
 * a wall-clock string. This module is the one place that converts between them,
 * so the grid and the invoice print keep seeing exactly the format they always
 * have.
 *
 * Everything here is pure — the review queue imports it from the browser, so
 * nothing in this file may touch the database.
 */

/** Longer than this and you forgot to clock out — flag, never auto-approve. */
export const LONG_PUNCH_HOURS = 8

/** A clock-in dated further off than this is a client-clock problem. */
export const MAX_BACKDATE_MS = 24 * 60 * 60 * 1000

/**
 * How a punch was made. `agent` rows are written already-approved by
 * `logAgentTime` — the approval happened in the chat that proposed them.
 */
export type PunchSource = "api" | "watch" | "web" | "agent" | "recorder"

/** Y/M/D/h/m for an instant, read in the given zone. */
function zoned(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at)
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0")
  // Intl renders midnight as hour 24 in some engines.
  const hour = get("hour") % 24
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  }
}

/** The calendar day a punch belongs to, in the workspace's zone. */
export function occurredOnIn(at: Date, timeZone: string) {
  const p = zoned(at, timeZone)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

/** "4:13 PM" — the format the sheet has always stored. */
export function wallClockIn(at: Date, timeZone: string) {
  const p = zoned(at, timeZone)
  const meridiem = p.hour < 12 ? "AM" : "PM"
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  return `${hour12}:${pad2(p.minute)} ${meridiem}`
}

/**
 * Exact hours to two decimals. No rounding increment — a 23-minute punch bills
 * 0.38, matching how the sheets have always been written by hand.
 */
export function punchHours(startedAt: Date, endedAt: Date): number {
  const ms = endedAt.getTime() - startedAt.getTime()
  if (!(ms > 0)) return 0
  return Math.round((ms / 3_600_000) * 100) / 100
}

export function punchMinutes(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000))
}

/** "1:13" — raw elapsed, shown next to the billed decimal so both are visible. */
export function elapsedLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  return `${hours}:${pad2(minutes % 60)}`
}

export type PunchFlag = "long" | "crosses_midnight" | "stale" | "zero"

/** Everything about a stopped punch that should stop a one-tap approve. */
export function punchFlags(
  punch: Pick<TimePunch, "startedAt" | "endedAt" | "status">,
  timeZone: string,
  now = new Date()
): PunchFlag[] {
  const flags: PunchFlag[] = []
  const start = new Date(punch.startedAt)

  if (punch.status === "running") {
    if (now.getTime() - start.getTime() > LONG_PUNCH_HOURS * 3_600_000) {
      flags.push("stale")
    }
    return flags
  }

  if (!punch.endedAt) return flags
  const end = new Date(punch.endedAt)
  const hours = punchHours(start, end)
  if (hours <= 0) flags.push("zero")
  if (hours > LONG_PUNCH_HOURS) flags.push("long")
  if (occurredOnIn(start, timeZone) !== occurredOnIn(end, timeZone)) {
    flags.push("crosses_midnight")
  }
  return flags
}

export const FLAG_LABEL: Record<PunchFlag, string> = {
  long: `Over ${LONG_PUNCH_HOURS} hours — check the end time`,
  crosses_midnight: "Crossed midnight — check the end time",
  stale: "Still running since yesterday",
  zero: "No elapsed time",
}

/**
 * Karol's rule: a punch always names a client, and when no project explains
 * the work, the summary has to. Returns null when the punch is approvable.
 */
export function approvalBlocker(input: {
  clientId: string | null
  projectId: string | null
  summary: string
  hours: number
}): string | null {
  if (!input.clientId) return "Pick a client before approving."
  if (!input.projectId && !input.summary.trim()) {
    return "No project on this one — write a summary so the invoice line reads."
  }
  if (!(input.hours > 0)) return "Hours must be more than zero."
  if (input.hours > 24) return "Hours must be 24 or less."
  return null
}

/** Accepts a client-supplied instant, clamped so a bad device clock can't drift. */
export function resolveInstant(
  raw: unknown,
  now = new Date()
): { at: Date } | { error: string } {
  if (raw == null || raw === "") return { at: now }
  if (typeof raw !== "string") return { error: "`at` must be an ISO timestamp." }
  const at = new Date(raw)
  if (Number.isNaN(at.getTime())) {
    return { error: "`at` must be an ISO timestamp." }
  }
  if (Math.abs(at.getTime() - now.getTime()) > MAX_BACKDATE_MS) {
    return { error: "`at` must be within 24 hours of now." }
  }
  return { at }
}

/**
 * An explicit instant with no drift clamp — for callers that know exactly
 * when something happened (an agent log reconstructed from session
 * transcripts), as opposed to a device reporting "now, roughly".
 */
export function parseInstant(raw: unknown): { at: Date } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: "Send an ISO timestamp." }
  }
  const at = new Date(raw)
  if (Number.isNaN(at.getTime())) return { error: "Not a valid ISO timestamp." }
  return { at }
}

/* ------------------------------------------------------------ after the fact */

/**
 * A time the way Karol says it — "11:48 AM", "11:48am", "9am", "14:05" — on a
 * given local day, or a full instant ("2026-09-16T11:48:00+02:00"), or a local
 * "2026-09-16 11:48". Local times resolve in `timeZone`, the zone the sheet
 * already files days in.
 */
export function parsePunchTime(
  raw: string,
  day: string,
  timeZone: string
): { at: Date } | { error: string } {
  const text = raw.trim()
  if (!text) return { error: "Send a time." }

  if (/^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}/.test(text)) {
    const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text)
    if (zoned) {
      const at = new Date(text)
      return Number.isNaN(at.getTime()) ? { error: `"${text}" is not a time I can read.` } : { at }
    }
    const [datePart, clock] = text.split(/[T ]/)
    return parsePunchTime(clock.slice(0, 5), datePart, timeZone)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "The day must be YYYY-MM-DD." }

  let hour: number
  let minute: number
  const twelve = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m?\.?$/i.exec(text)
  const twentyFour = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (twelve) {
    hour = Number(twelve[1])
    minute = Number(twelve[2] ?? "0")
    if (hour < 1 || hour > 12) return { error: `"${text}" is not a time I can read.` }
    hour = (hour % 12) + (twelve[3].toLowerCase() === "p" ? 12 : 0)
  } else if (twentyFour) {
    hour = Number(twentyFour[1])
    minute = Number(twentyFour[2])
    if (hour > 23) return { error: `"${text}" is not a time I can read.` }
  } else {
    return { error: `"${text}" is not a time I can read. Send "11:48 AM", "14:05", or an ISO instant.` }
  }
  if (minute > 59) return { error: `"${text}" is not a time I can read.` }

  const [y, m, d] = day.split("-").map(Number)
  // The zone's offset at the guessed instant, then again at the corrected one (DST edges).
  const guess = Date.UTC(y, m - 1, d, hour, minute)
  let at = guess - zoneOffset(new Date(guess), timeZone)
  at = guess - zoneOffset(new Date(at), timeZone)
  return { at: new Date(at) }
}

/** The zone's UTC offset at `at`, in ms — Warsaw in summer is +7 200 000. */
function zoneOffset(at: Date, timeZone: string) {
  const p = zoned(at, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return asUtc - Math.floor(at.getTime() / 60_000) * 60_000
}

/** A split has to land strictly inside a finished punch. */
export function splitBlocker(start: Date, end: Date | null, at: Date): string | null {
  if (!end) return "Clock this punch out before splitting it."
  if (at.getTime() <= start.getTime() || at.getTime() >= end.getTime()) {
    return "The split time has to fall inside the punch, not on or past either end."
  }
  return null
}

/**
 * What an approved line bills after its punch changes: what the caller says,
 * else the new span when the times moved, else what the line already bills —
 * it may have been corrected by hand on the sheet, and that correction stands.
 */
export function revisedHours(input: {
  explicit?: number | null
  timesChanged: boolean
  start: Date
  end: Date
  current: number
}): number {
  if (input.explicit != null) return Math.round(input.explicit * 100) / 100
  if (input.timesChanged) return punchHours(input.start, input.end)
  return input.current
}
