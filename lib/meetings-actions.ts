"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import {
  calendarEvents,
  clients,
  ignoredDomains,
  timeEntries,
} from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { hoursToString } from "@/lib/timesheet"

type Result = { ok: true } | { ok: false; error: string }

function revalidateAll() {
  revalidatePath("/timesheet")
  revalidatePath("/timesheet/meetings")
  revalidatePath("/calendar")
}

/**
 * Turn one meeting into a real time entry. Wall-clock values come from the
 * browser so the entry lands on the day the meeting actually happened for the
 * person looking at it.
 */
export async function logMeeting(input: {
  eventId: string
  clientId: string
  occurredOn: string
  startedAt: string
  endedAt: string
  hours: number
  summary: string
}): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) {
    return { ok: false, error: "That date is not valid." }
  }
  if (!(input.hours > 0) || input.hours > 12) {
    return { ok: false, error: "Hours must be between 0 and 12." }
  }

  const event = await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, input.eventId),
  })
  if (!event) return { ok: false, error: "Meeting not found." }

  const existing = await db.query.timeEntries.findFirst({
    where: eq(timeEntries.calendarEventId, input.eventId),
  })
  if (existing) return { ok: false, error: "Already logged." }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, input.clientId),
    with: { retainers: true },
  })
  if (!client) return { ok: false, error: "Client not found." }

  // Match the timesheet's own convention: bill to the live retainer if there is one.
  const retainer =
    client.retainers.find((row) => row.status === "active") ??
    client.retainers[0] ??
    null

  await db.insert(timeEntries).values({
    clientId: client.id,
    retainerId: retainer?.id ?? null,
    calendarEventId: event.id,
    occurredOn: input.occurredOn,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    hours: hoursToString(input.hours),
    summary: input.summary.trim() || event.title,
  })

  // Now that a client owns this meeting, say so on the calendar too.
  await db
    .update(calendarEvents)
    .set({ clientId: client.id })
    .where(eq(calendarEvents.id, event.id))

  revalidateAll()
  return { ok: true }
}

export async function dismissMeeting(eventId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  await db
    .update(calendarEvents)
    .set({ dismissed: true })
    .where(eq(calendarEvents.id, eventId))
  revalidateAll()
  return { ok: true }
}

export async function setClientDomains(
  slug: string,
  domains: string
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
  })
  if (!client) return { ok: false, error: "Client not found." }

  const clean = domains
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean)

  await db
    .update(clients)
    .set({ domains: clean, updatedAt: new Date() })
    .where(eq(clients.id, client.id))
  revalidateAll()
  return { ok: true }
}

function normalizeDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
}

/** Append a domain to a client — additive, so existing mappings survive. */
export async function assignDomainToClient(
  domain: string,
  slug: string
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const clean = normalizeDomain(domain)
  if (!clean) return { ok: false, error: "That is not a domain." }

  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
  })
  if (!client) return { ok: false, error: "Client not found." }

  const taken = await db.query.clients.findMany()
  const owner = taken.find(
    (c) => c.id !== client.id && c.domains.includes(clean)
  )
  if (owner) {
    return { ok: false, error: `${clean} already belongs to ${owner.name}.` }
  }

  if (!client.domains.includes(clean)) {
    await db
      .update(clients)
      .set({ domains: [...client.domains, clean], updatedAt: new Date() })
      .where(eq(clients.id, client.id))
  }
  revalidateAll()
  return { ok: true }
}

/** Mark a domain as never-a-client so it stops appearing in triage. */
export async function ignoreDomain(
  domain: string,
  note = ""
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const clean = normalizeDomain(domain)
  if (!clean) return { ok: false, error: "That is not a domain." }

  await db
    .insert(ignoredDomains)
    .values({ domain: clean, note })
    .onConflictDoNothing()
  revalidateAll()
  return { ok: true }
}
