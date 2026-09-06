import { db } from "@/db"
import { calendarSources } from "@/db/schema"
import { createGoogleEvent, findGoogleEventByRef } from "@/lib/calendar-providers"
import { syncSource } from "@/lib/calendar-sync"

/**
 * Writing an event to a Google calendar, shared by the New-event form
 * (session), `POST /api/calendar/events` (device token), and the chat tool
 * so all three make the same event the same way. Pure of auth — callers gate.
 */

/** Life / personal blocks land here. Work still uses the destination (Remote). */
export const PERSONAL_CALENDAR_ID = "karolzbuczek@gmail.com"

export type WriteEventInput = {
  title: string
  description?: string
  location?: string
  /**
   * Wall-clock `YYYY-MM-DDTHH:mm`, or a bare `YYYY-MM-DD` for an all-day
   * block. Read in `timeZone` when timed.
   */
  startsAt: string
  /** Omit to default +1 hour (timed) or the same day (all-day). */
  endsAt?: string
  timeZone?: string
  attendees?: string[]
  /**
   * Which Google calendar. Empty = the Settings destination (Remote).
   * `personal` / `gmail` / the Gmail address = karolzbuczek@gmail.com.
   * Otherwise a connected label or calendar id.
   */
  calendar?: string | null
  /** Caller's own id. A replay with the same key returns the existing event. */
  refKey?: string | null
}

export type WriteEventResult =
  | { ok: true; id: string; url: string; replayed: boolean; calendar: string }
  | { ok: false; status: number; error: string }

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Google's `dateTime` is RFC 3339 and wants seconds; `YYYY-MM-DDTHH:mm` is a 400. */
function withSeconds(value: string) {
  return value.length === 16 ? `${value}:00` : value
}

function addHours(wall: string, hours: number) {
  const stamp = withSeconds(wall)
  const fake = new Date(`${stamp}Z`)
  fake.setUTCHours(fake.getUTCHours() + hours)
  return fake.toISOString().slice(0, 16)
}

function addDays(isoDay: string, days: number) {
  const fake = new Date(`${isoDay}T00:00:00Z`)
  fake.setUTCDate(fake.getUTCDate() + days)
  return fake.toISOString().slice(0, 10)
}

type SourcePick = {
  kind: string
  enabled: boolean
  writable: boolean
  label: string
  externalId: string
}

/**
 * Resolve which Google calendar a write should hit.
 *
 * No hint → the one marked Destination in Settings (today: Remote).
 * `personal` / `gmail` / the personal address → karolzbuczek@gmail.com.
 * Anything else matches a connected label or calendar id.
 */
export function pickCalendarSource<T extends SourcePick>(
  sources: T[],
  hint?: string | null
): { source: T } | { error: string } {
  const google = sources.filter((s) => s.kind === "google" && s.enabled)
  const wanted = (hint ?? "").trim().toLowerCase()

  if (!wanted) {
    const dest = google.find((s) => s.writable)
    if (!dest) {
      return { error: "No destination calendar. Pick one in Settings → Integrations → Calendar." }
    }
    return { source: dest }
  }

  const personal =
    wanted === "personal" ||
    wanted === "gmail" ||
    wanted === "life" ||
    wanted === PERSONAL_CALENDAR_ID
  if (personal) {
    const match = google.find((s) => s.externalId.toLowerCase() === PERSONAL_CALENDAR_ID)
    if (!match) {
      return { error: `Personal calendar ${PERSONAL_CALENDAR_ID} is not connected.` }
    }
    return { source: match }
  }

  const hit = google.find(
    (s) => s.label.toLowerCase() === wanted || s.externalId.toLowerCase() === wanted
  )
  if (!hit) return { error: `No connected Google calendar matches "${hint}".` }
  return { source: hit }
}

export async function writeCalendarEvent(input: WriteEventInput): Promise<WriteEventResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, status: 400, error: "Give the event a title." }

  const start = (input.startsAt ?? "").trim()
  const endRaw = (input.endsAt ?? "").trim()
  if (!start) return { ok: false, status: 400, error: "Pick a start." }

  const startDate = DATE_ONLY.test(start)
  const startWall = WALL_CLOCK.test(start)
  if (!startDate && !startWall) {
    return { ok: false, status: 400, error: "startsAt must be YYYY-MM-DD or YYYY-MM-DDTHH:mm." }
  }

  const allDay = startDate
  let endsAt = endRaw
  if (!endsAt) {
    endsAt = allDay ? start : addHours(start, 1)
  } else if (allDay && !DATE_ONLY.test(endsAt)) {
    return { ok: false, status: 400, error: "An all-day event needs a YYYY-MM-DD end, or none." }
  } else if (!allDay && !WALL_CLOCK.test(endsAt)) {
    return { ok: false, status: 400, error: "endsAt must be local wall-clock, YYYY-MM-DDTHH:mm." }
  }

  if (endsAt < start && !allDay) {
    return { ok: false, status: 400, error: "The end has to come after the start." }
  }
  if (allDay && endsAt < start) {
    return { ok: false, status: 400, error: "The end has to come after the start." }
  }

  const sources = await db.query.calendarSources.findMany()
  const picked = pickCalendarSource(sources, input.calendar)
  if ("error" in picked) return { ok: false, status: 409, error: picked.error }
  const destination = picked.source

  const refKey = input.refKey?.trim() || null
  try {
    if (refKey) {
      const existing = await findGoogleEventByRef(destination.externalId, refKey)
      if (existing) {
        return {
          ok: true,
          id: existing.id,
          url: existing.htmlLink,
          replayed: true,
          calendar: destination.label,
        }
      }
    }
    const created = await createGoogleEvent(destination.externalId, {
      title,
      description: (input.description ?? "").trim(),
      location: (input.location ?? "").trim(),
      startsAt: allDay ? start : withSeconds(start),
      // Google's all-day end is exclusive — the day after the last day.
      endsAt: allDay ? addDays(endsAt, 1) : withSeconds(endsAt),
      timeZone: input.timeZone || "UTC",
      attendees: input.attendees ?? [],
      allDay,
      refKey,
    })
    await syncSource(destination.id)
    return {
      ok: true,
      id: created.id,
      url: created.htmlLink,
      replayed: false,
      calendar: destination.label,
    }
  } catch (error) {
    return { ok: false, status: 502, error: error instanceof Error ? error.message : String(error) }
  }
}
