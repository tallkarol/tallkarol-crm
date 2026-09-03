"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { calendarEvents, calendarSources } from "@/db/schema"
import type { CalendarSourceKind } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { getMeetingsInWindow, type MeetingSource } from "@/lib/calendar"
import { moveGoogleEvent } from "@/lib/calendar-providers"
import { syncAllCalendars } from "@/lib/calendar-sync"
import { writeCalendarEvent } from "@/lib/calendar-write"
import { SOURCE_PALETTE, type UpcomingMeeting } from "@/lib/calendar-types"

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

function revalidateCalendar() {
  revalidatePath("/calendar")
  revalidatePath("/settings/integrations/calendar")
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function requireAdmin() {
  const user = await getSessionUser()
  return user ? null : "Sign in first."
}

/* ------------------------------------------------------------- managing -- */

export async function addCalendarSource(input: {
  kind: CalendarSourceKind
  label: string
  externalId: string
}): Promise<Result<{ id: string }>> {
  const denied = await requireAdmin()
  if (denied) return { ok: false, error: denied }

  const label = input.label.trim()
  const externalId = input.externalId.trim()
  if (!label) return { ok: false, error: "Give the calendar a name." }
  if (input.kind === "google" && !externalId) {
    return { ok: false, error: "Google needs the calendar id (usually the address)." }
  }
  if (input.kind === "ics" && !/^https?:\/\//i.test(externalId)) {
    return { ok: false, error: "An ICS source needs a feed URL." }
  }

  const existing = await db.query.calendarSources.findMany()
  if (
    input.kind !== "cal_com" &&
    existing.some(
      (row) => row.kind === input.kind && row.externalId === externalId
    )
  ) {
    return { ok: false, error: "That calendar is already connected." }
  }
  if (input.kind === "cal_com" && existing.some((row) => row.kind === "cal_com")) {
    return { ok: false, error: "Cal.com is already connected." }
  }

  const [row] = await db
    .insert(calendarSources)
    .values({
      kind: input.kind,
      label,
      externalId: input.kind === "cal_com" ? "" : externalId,
      color: SOURCE_PALETTE[existing.length % SOURCE_PALETTE.length],
      sort: existing.length,
    })
    .returning({ id: calendarSources.id })

  revalidateCalendar()
  return { ok: true, id: row.id }
}

export async function updateCalendarSource(
  id: string,
  patch: { label?: string; color?: string; enabled?: boolean; writable?: boolean }
): Promise<Result> {
  const denied = await requireAdmin()
  if (denied) return { ok: false, error: denied }

  const source = await db.query.calendarSources.findFirst({
    where: eq(calendarSources.id, id),
  })
  if (!source) return { ok: false, error: "Calendar not found." }

  if (patch.writable) {
    if (source.kind !== "google") {
      return { ok: false, error: "Only a Google calendar can receive new events." }
    }
    // Exactly one destination calendar, so a new event is never ambiguous.
    await db
      .update(calendarSources)
      .set({ writable: false, updatedAt: new Date() })
      .where(eq(calendarSources.writable, true))
  }

  await db
    .update(calendarSources)
    .set({
      ...(patch.label != null ? { label: patch.label.trim() } : {}),
      ...(patch.color != null ? { color: patch.color } : {}),
      ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
      ...(patch.writable != null ? { writable: patch.writable } : {}),
      updatedAt: new Date(),
    })
    .where(eq(calendarSources.id, id))

  revalidateCalendar()
  return { ok: true }
}

export async function deleteCalendarSource(id: string): Promise<Result> {
  const denied = await requireAdmin()
  if (denied) return { ok: false, error: denied }

  await db.delete(calendarSources).where(eq(calendarSources.id, id))
  revalidateCalendar()
  return { ok: true }
}

/* ---------------------------------------------------------------- sync --- */

export async function syncCalendars(): Promise<
  Result<{ synced: number; errors: string[] }>
> {
  const denied = await requireAdmin()
  if (denied) return { ok: false, error: denied }

  const { synced, errors } = await syncAllCalendars()
  revalidateCalendar()
  return { ok: true, synced, errors }
}

/* --------------------------------------------------------------- create -- */

export async function createCalendarEvent(input: {
  title: string
  description: string
  location: string
  startsAt: string
  endsAt: string
  timeZone: string
  attendees: string
}): Promise<Result<{ url: string }>> {
  const denied = await requireAdmin()
  if (denied) return { ok: false, error: denied }

  const attendees = input.attendees
    .split(/[,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes("@"))

  const result = await writeCalendarEvent({ ...input, attendees })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateCalendar()
  return { ok: true, url: result.url }
}

/* ------------------------------------------------------ dashboard week ---- */

/** The dashboard's five-day window, paged by its arrows. ISO bounds. */
export async function meetingsInWindow(
  fromIso: string,
  toIso: string
): Promise<Result<{ data: { meetings: UpcomingMeeting[]; sources: MeetingSource[] } }>> {
  const denied = await requireAdmin()
  if (denied) return { ok: false, error: denied }
  const from = new Date(fromIso)
  const to = new Date(toIso)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return { ok: false, error: "That window is not valid." }
  }
  const { meetings, sources } = await getMeetingsInWindow(from, to)
  return { ok: true, data: { meetings, sources } }
}

/**
 * Drag an event to another day. The time of day and the length are kept; only
 * the date moves. Written to Google first — if that fails nothing changes
 * locally, so the cache never disagrees with the calendar it mirrors.
 */
export async function moveMeeting(
  id: string,
  dayShift: number
): Promise<Result<{ data: { startsAt: string; endsAt: string } }>> {
  const denied = await requireAdmin()
  if (denied) return { ok: false, error: denied }
  if (!Number.isInteger(dayShift) || Math.abs(dayShift) > 60) {
    return { ok: false, error: "That move is not valid." }
  }
  const event = await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, id),
    with: { source: true },
  })
  if (!event) return { ok: false, error: "That event is gone." }
  if (event.source.kind !== "google" || !event.source.writable) {
    const where = event.source.kind === "cal_com" ? "Cal.com" : "its own calendar"
    return { ok: false, error: `${event.source.label} is read-only here — move it in ${where}.` }
  }
  if (dayShift === 0) {
    return {
      ok: true,
      data: { startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString() },
    }
  }

  const day = 86_400_000
  const startsAt = new Date(event.startsAt.getTime() + dayShift * day)
  const endsAt = new Date(event.endsAt.getTime() + dayShift * day)
  try {
    await moveGoogleEvent(event.source.externalId, event.externalId, {
      startsAt,
      endsAt,
      allDay: event.allDay,
    })
  } catch (error) {
    return { ok: false, error: message(error) || "Google did not accept the move." }
  }
  await db
    .update(calendarEvents)
    .set({ startsAt, endsAt })
    .where(eq(calendarEvents.id, id))
  revalidatePath("/")
  revalidateCalendar()
  return { ok: true, data: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } }
}
