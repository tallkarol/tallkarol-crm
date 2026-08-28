import { googleAccessToken, googleAuthConfigured } from "@/lib/google-auth"
import type { CalendarAttendee } from "@/db/schema"

/**
 * `calendar.events` covers read and write. Per-calendar ACL still decides what
 * the service account may actually do, so a calendar shared read-only stays
 * read-only even though the token carries the write scope.
 */
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
]

const GOOGLE_API = "https://www.googleapis.com/calendar/v3"
const CALCOM_API = "https://api.cal.com/v2"

/** Overridable because Cal.com pins response shape to a dated version header. */
const CALCOM_VERSION = process.env.CALCOM_API_VERSION || "2026-05-01"

/** A source-agnostic event, before it is written to the cache table. */
export type ProviderEvent = {
  externalId: string
  title: string
  description: string
  location: string
  url: string
  startsAt: Date
  endsAt: Date
  allDay: boolean
  cancelled: boolean
  attendees: CalendarAttendee[]
}

export function calComConfigured() {
  return Boolean(process.env.CALCOM_API_KEY)
}

export { googleAuthConfigured }

function asDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/* ---------------------------------------------------------------- Google -- */

type GoogleEvent = {
  id?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: { email?: string; displayName?: string }[]
}

/**
 * All-day events arrive as bare `YYYY-MM-DD`. We anchor them at UTC midnight so
 * they are never dragged into the previous day by a negative offset; the view
 * formats all-day items in UTC to match.
 */
function googleBounds(edge: { date?: string; dateTime?: string } | undefined) {
  if (edge?.dateTime) return { at: asDate(edge.dateTime), allDay: false }
  if (edge?.date) return { at: asDate(`${edge.date}T00:00:00Z`), allDay: true }
  return { at: null, allDay: false }
}

export async function fetchGoogleEvents(
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<ProviderEvent[]> {
  const token = await googleAccessToken(CALENDAR_SCOPES)
  const events: ProviderEvent[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      // Let Google expand recurrence rules so we never parse RRULE ourselves.
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      showDeleted: "true",
    })
    if (pageToken) params.set("pageToken", pageToken)

    const res = await fetch(
      `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    )
    const json = (await res.json()) as {
      items?: GoogleEvent[]
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(json.error?.message || `Google Calendar ${res.status}`)
    }

    for (const item of json.items ?? []) {
      const start = googleBounds(item.start)
      const end = googleBounds(item.end)
      if (!item.id || !start.at || !end.at) continue
      events.push({
        externalId: item.id,
        title: item.summary?.trim() || "(no title)",
        description: item.description?.trim() || "",
        location: item.location?.trim() || "",
        url: item.hangoutLink || item.htmlLink || "",
        startsAt: start.at,
        endsAt: end.at,
        allDay: start.allDay,
        cancelled: item.status === "cancelled",
        attendees: (item.attendees ?? [])
          .filter((person) => person.email)
          .map((person) => ({
            name: person.displayName?.trim() || "",
            email: person.email!.toLowerCase(),
          })),
      })
    }
    pageToken = json.nextPageToken
  } while (pageToken)

  return events
}

export type NewGoogleEvent = {
  title: string
  description: string
  location: string
  /** Local wall-clock, `YYYY-MM-DDTHH:mm`, interpreted in `timeZone`. */
  startsAt: string
  endsAt: string
  timeZone: string
  attendees: string[]
}

export async function createGoogleEvent(
  calendarId: string,
  input: NewGoogleEvent
): Promise<{ id: string; htmlLink: string }> {
  const token = await googleAccessToken(CALENDAR_SCOPES)
  const res = await fetch(
    `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        summary: input.title,
        description: input.description || undefined,
        location: input.location || undefined,
        start: { dateTime: input.startsAt, timeZone: input.timeZone },
        end: { dateTime: input.endsAt, timeZone: input.timeZone },
        attendees: input.attendees.length
          ? input.attendees.map((email) => ({ email }))
          : undefined,
      }),
    }
  )
  const json = (await res.json()) as {
    id?: string
    htmlLink?: string
    error?: { message?: string }
  }
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Google Calendar ${res.status}`)
  }
  return { id: json.id, htmlLink: json.htmlLink || "" }
}

/* --------------------------------------------------------------- Cal.com -- */

type CalComBooking = {
  id?: number | string
  uid?: string
  title?: string
  description?: string
  status?: string
  start?: string
  end?: string
  location?: string
  meetingUrl?: string
  attendees?: { name?: string; email?: string }[]
}

export async function fetchCalComBookings(
  timeMin: Date,
  timeMax: Date
): Promise<ProviderEvent[]> {
  const key = process.env.CALCOM_API_KEY
  if (!key) throw new Error("CALCOM_API_KEY is not set")

  const events: ProviderEvent[] = []
  const limit = 100
  let cursor: string | null = null

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      afterStart: timeMin.toISOString(),
      beforeEnd: timeMax.toISOString(),
      sortStart: "asc",
      limit: String(limit),
    })
    if (cursor) params.set("cursor", cursor)

    const res: Response = await fetch(`${CALCOM_API}/bookings?${params}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        "cal-api-version": CALCOM_VERSION,
      },
      cache: "no-store",
    })
    const json = (await res.json()) as {
      status?: string
      data?: CalComBooking[]
      error?: unknown
      pagination?: { nextCursor?: string | null; hasMore?: boolean }
    }
    if (!res.ok) {
      const detail =
        typeof json.error === "string" ? json.error : JSON.stringify(json.error)
      throw new Error(
        `Cal.com ${res.status}${detail && detail !== "undefined" ? ` — ${detail}` : ""} (cal-api-version ${CALCOM_VERSION})`
      )
    }

    const rows = json.data ?? []
    for (const booking of rows) {
      const externalId = booking.uid || (booking.id != null ? String(booking.id) : "")
      const startsAt = asDate(booking.start)
      const endsAt = asDate(booking.end)
      if (!externalId || !startsAt || !endsAt) continue
      events.push({
        externalId,
        title: booking.title?.trim() || "Booking",
        description: booking.description?.trim() || "",
        location: booking.location?.trim() || "",
        url: booking.meetingUrl || (booking.uid ? `https://cal.com/booking/${booking.uid}` : ""),
        startsAt,
        endsAt,
        allDay: false,
        cancelled: booking.status === "cancelled" || booking.status === "rejected",
        attendees: (booking.attendees ?? [])
          .filter((person) => person.email)
          .map((person) => ({
            name: person.name?.trim() || "",
            email: person.email!.toLowerCase(),
          })),
      })
    }

    cursor = json.pagination?.nextCursor ?? null
    if (!cursor || rows.length < limit) break
  }

  return events
}
