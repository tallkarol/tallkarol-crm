import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { calendarSources } from "@/db/schema"
import { createGoogleEvent, findGoogleEventByRef } from "@/lib/calendar-providers"
import { syncSource } from "@/lib/calendar-sync"

/**
 * Writing an event to the destination calendar, shared by the New-event form
 * (session) and `POST /api/calendar/events` (device token) so both make the
 * same event the same way. Pure of auth — callers gate.
 */

export type WriteEventInput = {
  title: string
  description?: string
  location?: string
  /** Local wall-clock `YYYY-MM-DDTHH:mm`, read in `timeZone`. */
  startsAt: string
  endsAt: string
  timeZone?: string
  attendees?: string[]
  /** Caller's own id. A replay with the same key returns the existing event. */
  refKey?: string | null
}

export type WriteEventResult =
  | { ok: true; id: string; url: string; replayed: boolean }
  | { ok: false; status: number; error: string }

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

/** Google's `dateTime` is RFC 3339 and wants seconds; `YYYY-MM-DDTHH:mm` is a 400. */
function withSeconds(value: string) {
  return value.length === 16 ? `${value}:00` : value
}

export async function writeCalendarEvent(input: WriteEventInput): Promise<WriteEventResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, status: 400, error: "Give the event a title." }
  if (!input.startsAt || !input.endsAt) {
    return { ok: false, status: 400, error: "Pick a start and an end." }
  }
  if (!WALL_CLOCK.test(input.startsAt) || !WALL_CLOCK.test(input.endsAt)) {
    return { ok: false, status: 400, error: "startsAt/endsAt must be local wall-clock, YYYY-MM-DDTHH:mm." }
  }
  if (input.endsAt <= input.startsAt) {
    return { ok: false, status: 400, error: "The end has to come after the start." }
  }

  const destination = await db.query.calendarSources.findFirst({
    where: and(eq(calendarSources.writable, true), eq(calendarSources.enabled, true)),
  })
  if (!destination || destination.kind !== "google") {
    return {
      ok: false,
      status: 409,
      error: "No destination calendar. Pick one in Settings → Integrations → Calendar.",
    }
  }

  const refKey = input.refKey?.trim() || null
  try {
    if (refKey) {
      const existing = await findGoogleEventByRef(destination.externalId, refKey)
      if (existing) return { ok: true, id: existing.id, url: existing.htmlLink, replayed: true }
    }
    const created = await createGoogleEvent(destination.externalId, {
      title,
      description: (input.description ?? "").trim(),
      location: (input.location ?? "").trim(),
      startsAt: withSeconds(input.startsAt),
      endsAt: withSeconds(input.endsAt),
      timeZone: input.timeZone || "UTC",
      attendees: input.attendees ?? [],
      refKey,
    })
    await syncSource(destination.id)
    return { ok: true, id: created.id, url: created.htmlLink, replayed: false }
  } catch (error) {
    return { ok: false, status: 502, error: error instanceof Error ? error.message : String(error) }
  }
}
