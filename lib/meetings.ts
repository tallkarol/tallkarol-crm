import { and, asc, eq, gte, isNull, isNotNull, lte, ne } from "drizzle-orm"
import { db } from "@/db"
import {
  calendarEvents,
  clients,
  ignoredDomains,
  timeEntries,
} from "@/db/schema"
import type { CalendarAttendee } from "@/db/schema"

/** Free-mail and meeting-room hosts never identify a client. */
export const IGNORED_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "tallkarol.com",
  "karolbuczek.com",
  "resource.calendar.google.com",
  "group.calendar.google.com",
])

/** Anything longer is a calendar block, not a meeting. */
const MAX_MEETING_HOURS = 12

export type MeetingProposal = {
  eventId: string
  title: string
  startsAt: string
  endsAt: string
  hours: number
  clientId: string
  clientName: string
  clientSlug: string
  matchedDomain: string
  attendees: CalendarAttendee[]
  sourceLabel: string
}

export function attendeeDomains(attendees: CalendarAttendee[]): string[] {
  const seen = new Set<string>()
  for (const person of attendees) {
    const domain = (person.email || "").split("@")[1]?.toLowerCase()
    if (domain && !IGNORED_DOMAINS.has(domain)) seen.add(domain)
  }
  return Array.from(seen)
}

export function meetingHours(startsAt: Date, endsAt: Date) {
  return (endsAt.getTime() - startsAt.getTime()) / 3_600_000
}

/**
 * Timed meetings that carry a known client domain and have not already been
 * logged or waved off. Nothing is written until someone accepts one.
 */
export async function meetingProposals(
  sinceDays = 60
): Promise<MeetingProposal[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000)

  const [allClients, logged, events] = await Promise.all([
    db.query.clients.findMany(),
    db
      .select({ eventId: timeEntries.calendarEventId })
      .from(timeEntries)
      .where(isNotNull(timeEntries.calendarEventId)),
    db.query.calendarEvents.findMany({
      where: and(
        eq(calendarEvents.allDay, false),
        eq(calendarEvents.cancelled, false),
        eq(calendarEvents.dismissed, false),
        gte(calendarEvents.startsAt, since),
        lte(calendarEvents.startsAt, new Date()),
      ),
      orderBy: [asc(calendarEvents.startsAt)],
      with: { source: true },
    }),
  ])

  const byDomain = new Map<string, (typeof allClients)[number]>()
  for (const client of allClients) {
    for (const domain of client.domains) byDomain.set(domain.toLowerCase(), client)
  }
  const alreadyLogged = new Set(logged.map((row) => row.eventId))

  const proposals: MeetingProposal[] = []
  for (const event of events) {
    if (alreadyLogged.has(event.id)) continue
    const hours = meetingHours(event.startsAt, event.endsAt)
    if (hours <= 0 || hours > MAX_MEETING_HOURS) continue

    const domain = attendeeDomains(event.attendees).find((d) => byDomain.has(d))
    if (!domain) continue
    const client = byDomain.get(domain)!

    proposals.push({
      eventId: event.id,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      hours: Math.round(hours * 100) / 100,
      clientId: client.id,
      clientName: client.name,
      clientSlug: client.slug,
      matchedDomain: domain,
      attendees: event.attendees,
      sourceLabel: event.source?.label ?? "",
    })
  }

  return proposals
}

/** One unassigned domain, with the meetings that make the case for it. */
export type DomainTriage = {
  domain: string
  hours: number
  meetingCount: number
  people: string[]
  meetings: {
    id: string
    title: string
    startsAt: string
    hours: number
    otherDomains: string[]
  }[]
}

/**
 * Meetings whose attendee domains match no client. Each one is a decision:
 * assign it to a client and its meetings become billable, or mark it as never
 * a client and it stops asking.
 */
export async function unmatchedDomains(sinceDays = 60): Promise<DomainTriage[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000)
  const [allClients, ignored, events] = await Promise.all([
    db.query.clients.findMany(),
    db.select({ domain: ignoredDomains.domain }).from(ignoredDomains),
    db.query.calendarEvents.findMany({
      where: and(
        eq(calendarEvents.allDay, false),
        eq(calendarEvents.cancelled, false),
        gte(calendarEvents.startsAt, since),
        lte(calendarEvents.startsAt, new Date()),
      ),
      orderBy: [asc(calendarEvents.startsAt)],
    }),
  ])

  const mapped = new Set(
    allClients.flatMap((c) => c.domains.map((d) => d.toLowerCase()))
  )
  for (const row of ignored) mapped.add(row.domain)

  const triage = new Map<string, DomainTriage>()
  for (const event of events) {
    const h = meetingHours(event.startsAt, event.endsAt)
    if (h <= 0 || h > MAX_MEETING_HOURS) continue
    const domains = attendeeDomains(event.attendees)

    for (const domain of domains) {
      if (mapped.has(domain)) continue
      let row = triage.get(domain)
      if (!row) {
        row = { domain, hours: 0, meetingCount: 0, people: [], meetings: [] }
        triage.set(domain, row)
      }
      row.hours += h
      row.meetingCount += 1
      for (const person of event.attendees) {
        const email = (person.email || "").toLowerCase()
        if (email.endsWith(`@${domain}`) && !row.people.includes(email)) {
          row.people.push(email)
        }
      }
      // Other domains in the room are the strongest hint about who this is.
      row.meetings.push({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        hours: Math.round(h * 100) / 100,
        otherDomains: domains.filter((d) => d !== domain),
      })
    }
  }

  return Array.from(triage.values())
    .map((row) => ({
      ...row,
      hours: Math.round(row.hours * 10) / 10,
      meetings: row.meetings.slice(-8).reverse(),
      people: row.people.slice(0, 6),
    }))
    .sort((a, b) => b.hours - a.hours)
}
