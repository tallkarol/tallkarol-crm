"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { calendarSources } from "@/db/schema"
import type { CalendarSourceKind } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { syncAllCalendars } from "@/lib/calendar-sync"
import { writeCalendarEvent } from "@/lib/calendar-write"
import { SOURCE_PALETTE } from "@/lib/calendar-types"

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
