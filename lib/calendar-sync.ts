import { and, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm"
import { db } from "@/db"
import { calendarEvents, calendarSources, inquiries } from "@/db/schema"
import type { CalendarSourceKind } from "@/db/schema"
import {
  fetchCalComBookings,
  fetchGoogleEvents,
  type ProviderEvent,
} from "@/lib/calendar-providers"

export type SyncResult =
  | { ok: true; count: number }
  | { ok: false; error: string }

/** How much of the calendar we keep warm, so month navigation never waits. */
const SYNC_BEFORE_DAYS = 120
const SYNC_AFTER_DAYS = 365

function syncWindow() {
  const now = Date.now()
  const day = 86_400_000
  return {
    from: new Date(now - SYNC_BEFORE_DAYS * day),
    to: new Date(now + SYNC_AFTER_DAYS * day),
  }
}

/** Drizzle has no `excluded` helper, so name the conflicting row explicitly. */
function excluded(column: string) {
  return sql.raw(`excluded."${column}"`)
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function fetchForSource(
  source: { kind: CalendarSourceKind; externalId: string },
  from: Date,
  to: Date
): Promise<ProviderEvent[]> {
  if (source.kind === "google") {
    return fetchGoogleEvents(source.externalId, from, to)
  }
  if (source.kind === "cal_com") {
    return fetchCalComBookings(from, to)
  }
  throw new Error("ICS feeds are not wired up yet.")
}

/** Attendee emails are the only bridge we have from a booking to the CRM. */
async function matchInquiries(events: ProviderEvent[]) {
  const emails = Array.from(
    new Set(events.flatMap((event) => event.attendees.map((a) => a.email)))
  ).filter(Boolean)
  if (emails.length === 0) return new Map<string, string>()

  const rows = await db
    .select({ id: inquiries.id, email: inquiries.email })
    .from(inquiries)
    .where(inArray(inquiries.email, emails))

  const byEmail = new Map<string, string>()
  for (const row of rows) {
    const key = row.email.toLowerCase()
    if (!byEmail.has(key)) byEmail.set(key, row.id)
  }
  return byEmail
}

export async function syncSource(sourceId: string): Promise<SyncResult> {
  const source = await db.query.calendarSources.findFirst({
    where: eq(calendarSources.id, sourceId),
  })
  if (!source) return { ok: false, error: "Calendar not found." }

  const { from, to } = syncWindow()
  try {
    const events = await fetchForSource(source, from, to)
    const inquiryByEmail = await matchInquiries(events)
    const now = new Date()

    if (events.length) {
      const values = events.map((event) => {
        const match = event.attendees
          .map((person) => inquiryByEmail.get(person.email))
          .find(Boolean)
        return {
          sourceId: source.id,
          externalId: event.externalId,
          title: event.title,
          description: event.description,
          location: event.location,
          url: event.url,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          cancelled: event.cancelled,
          attendees: event.attendees,
          inquiryId: match ?? null,
          syncedAt: now,
        }
      })

      // Chunked so a busy calendar never builds one oversized statement.
      for (let i = 0; i < values.length; i += 200) {
        await db
          .insert(calendarEvents)
          .values(values.slice(i, i + 200))
          .onConflictDoUpdate({
            target: [calendarEvents.sourceId, calendarEvents.externalId],
            set: {
              title: excluded("title"),
              description: excluded("description"),
              location: excluded("location"),
              url: excluded("url"),
              startsAt: excluded("starts_at"),
              endsAt: excluded("ends_at"),
              allDay: excluded("all_day"),
              cancelled: excluded("cancelled"),
              attendees: excluded("attendees"),
              inquiryId: excluded("inquiry_id"),
              syncedAt: now,
            },
          })
      }
    }

    // Drop anything the provider no longer returns inside the synced window.
    const keep = events.map((event) => event.externalId)
    await db.delete(calendarEvents).where(
      and(
        eq(calendarEvents.sourceId, source.id),
        gte(calendarEvents.startsAt, from),
        lte(calendarEvents.startsAt, to),
        ...(keep.length ? [notInArray(calendarEvents.externalId, keep)] : [])
      )
    )

    await db
      .update(calendarSources)
      .set({ lastSyncedAt: now, lastError: "", updatedAt: now })
      .where(eq(calendarSources.id, source.id))

    return { ok: true, count: events.length }
  } catch (error) {
    const text = message(error)
    await db
      .update(calendarSources)
      .set({ lastError: text, updatedAt: new Date() })
      .where(eq(calendarSources.id, source.id))
    return { ok: false, error: `${source.label}: ${text}` }
  }
}


export async function syncAllCalendars(): Promise<{
  synced: number
  errors: string[]
}> {
  const sources = await db.query.calendarSources.findMany({
    where: eq(calendarSources.enabled, true),
  })

  let synced = 0
  const errors: string[] = []
  for (const source of sources) {
    const result = await syncSource(source.id)
    if (result.ok) synced += result.count
    else errors.push(result.error)
  }
  return { synced, errors }
}
