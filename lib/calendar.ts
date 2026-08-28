import { and, asc, eq, gte, inArray, lte } from "drizzle-orm"
import { db } from "@/db"
import {
  calendarEvents,
  calendarSources,
  contracts,
  invoices,
  timeEntries,
} from "@/db/schema"
import { calComConfigured, googleAuthConfigured } from "@/lib/calendar-providers"
import {
  CRM_LANES,
  monthWindow,
  type CalendarItem,
  type CalendarLane,
  type CalendarSnapshot,
  type UpcomingMeeting,
} from "@/lib/calendar-types"
import { ROUTES } from "@/lib/nav"
import { pad2 } from "@/lib/timesheet"
import { formatHours, formatMoney } from "@/lib/work"

export * from "@/lib/calendar-types"

function isoDay(value: Date) {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`
}

/** CRM records carry a day, not a time — anchor them at UTC midnight. */
function dayBounds(iso: string) {
  const startsAt = new Date(`${iso}T00:00:00.000Z`)
  return {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 86_400_000).toISOString(),
  }
}

/** Synced events overlapping the next 7 local days, for the dashboard week. */
export async function getUpcomingMeetings(): Promise<{
  configured: boolean
  meetings: UpcomingMeeting[]
}> {
  const sources = await db.query.calendarSources.findMany()
  const enabled = sources.filter((source) => source.enabled)
  if (enabled.length === 0) return { configured: false, meetings: [] }

  const day = 86_400_000
  const from = new Date(Date.now() - 2 * day)
  const to = new Date(Date.now() + 9 * day)
  const rows = await db.query.calendarEvents.findMany({
    where: and(
      inArray(
        calendarEvents.sourceId,
        enabled.map((source) => source.id)
      ),
      gte(calendarEvents.endsAt, from),
      lte(calendarEvents.startsAt, to),
      eq(calendarEvents.cancelled, false)
    ),
    orderBy: [asc(calendarEvents.startsAt)],
  })

  const bySource = new Map(enabled.map((source) => [source.id, source]))
  return {
    configured: true,
    meetings: rows.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      allDay: event.allDay,
      location: event.location,
      description: event.description,
      url: event.url,
      color: bySource.get(event.sourceId)?.color ?? "#006965",
      source: bySource.get(event.sourceId)?.label ?? "",
      attendees: event.attendees,
    })),
  }
}

export async function getCalendarSnapshot(
  month: string
): Promise<CalendarSnapshot> {
  const { from, to } = monthWindow(month)
  const fromDay = isoDay(from)
  const toDay = isoDay(to)

  const sources = await db.query.calendarSources.findMany({
    orderBy: [asc(calendarSources.sort), asc(calendarSources.label)],
  })
  const enabled = sources.filter((source) => source.enabled)

  const cached = enabled.length
    ? await db.query.calendarEvents.findMany({
        where: and(
          inArray(
            calendarEvents.sourceId,
            enabled.map((source) => source.id)
          ),
          // Overlap test, so an event spanning into the window is not dropped.
          lte(calendarEvents.startsAt, to),
          gte(calendarEvents.endsAt, from)
        ),
        orderBy: [asc(calendarEvents.startsAt)],
        with: { client: true },
      })
    : []

  const [invoiceRows, contractRows, timeRows] = await Promise.all([
    db.query.invoices.findMany({
      where: and(gte(invoices.issuedOn, fromDay), lte(invoices.issuedOn, toDay)),
      with: { client: true },
    }),
    db.query.contracts.findMany({
      where: and(
        gte(contracts.effectiveOn, fromDay),
        lte(contracts.effectiveOn, toDay)
      ),
      with: { client: true },
    }),
    db.query.timeEntries.findMany({
      where: and(
        gte(timeEntries.occurredOn, fromDay),
        lte(timeEntries.occurredOn, toDay)
      ),
      with: { client: true },
    }),
  ])

  const items: CalendarItem[] = []

  for (const event of cached) {
    items.push({
      id: event.id,
      laneId: `src:${event.sourceId}`,
      title: event.title,
      detail: event.description,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      allDay: event.allDay,
      location: event.location,
      url: event.url,
      href: event.client ? ROUTES.client(event.client.slug) : null,
      attendees: event.attendees,
      cancelled: event.cancelled,
    })
  }

  for (const invoice of invoiceRows) {
    items.push({
      id: `invoice:${invoice.id}`,
      laneId: "crm:invoice",
      title: `${invoice.number} · ${invoice.client.name}`,
      detail: formatMoney(invoice.amountCents, invoice.currency),
      ...dayBounds(invoice.issuedOn),
      allDay: true,
      location: "",
      url: "",
      href: ROUTES.invoice(invoice.number),
      attendees: [],
      cancelled: false,
    })
  }

  for (const contract of contractRows) {
    if (!contract.effectiveOn) continue
    items.push({
      id: `contract:${contract.id}`,
      laneId: "crm:contract",
      title: contract.title,
      detail: contract.client.name,
      ...dayBounds(contract.effectiveOn),
      allDay: true,
      location: "",
      url: "",
      href: ROUTES.contract(contract.slug),
      attendees: [],
      cancelled: false,
    })
  }

  for (const entry of timeRows) {
    items.push({
      id: `time:${entry.id}`,
      laneId: "crm:time",
      title: entry.client.name,
      detail: [formatHours(entry.hours), entry.summary]
        .filter(Boolean)
        .join(" · "),
      ...dayBounds(entry.occurredOn),
      allDay: true,
      location: "",
      url: "",
      href: ROUTES.timesheetFor(
        entry.client.slug,
        entry.occurredOn.slice(0, 7)
      ),
      attendees: [],
      cancelled: false,
    })
  }

  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.laneId, (counts.get(item.laneId) ?? 0) + 1)
  }

  const lanes: CalendarLane[] = [
    ...enabled.map((source) => ({
      id: `src:${source.id}`,
      label: source.label,
      color: source.color,
      kind: source.kind,
      count: counts.get(`src:${source.id}`) ?? 0,
    })),
    ...CRM_LANES.map((lane) => ({
      id: lane.id,
      label: lane.label,
      color: lane.color,
      kind: "crm" as const,
      count: counts.get(lane.id) ?? 0,
    })),
  ]

  items.sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return {
    month,
    lanes,
    items,
    sources: sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      label: source.label,
      externalId: source.externalId,
      color: source.color,
      enabled: source.enabled,
      writable: source.writable,
      lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
      lastError: source.lastError,
    })),
    config: {
      google: googleAuthConfigured(),
      calCom: calComConfigured(),
    },
  }
}
