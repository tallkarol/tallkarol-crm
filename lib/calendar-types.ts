import type { CalendarAttendee, CalendarSourceKind } from "@/db/schema"

/** Muted, earthy hues so several calendars stay distinguishable on linen. */
export const SOURCE_PALETTE = [
  "#006965",
  "#2F6F8F",
  "#8A5A2B",
  "#6B7A5E",
  "#7A4E6E",
  "#B0603A",
] as const

export const SOURCE_KIND_LABEL: Record<CalendarSourceKind, string> = {
  google: "Google",
  cal_com: "Cal.com",
  ics: "ICS feed",
}

export const CRM_LANES = [
  { id: "crm:invoice", label: "Invoices", color: "#8A5A2B" },
  { id: "crm:contract", label: "Contracts", color: "#7A4E6E" },
  { id: "crm:time", label: "Logged time", color: "#6B7A5E" },
] as const

export type CalendarLane = {
  id: string
  label: string
  color: string
  kind: CalendarSourceKind | "crm"
  count: number
}

/** A synced booking/event slimmed down for the dashboard 7-day Meetings card. */
export type UpcomingMeeting = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string
  description: string
  url: string
  color: string
  source: string
  attendees: { name: string; email: string }[]
}

/**
 * Dates travel to the client as ISO strings and are bucketed into days there,
 * so the grid always reflects the viewer's timezone rather than the server's.
 */
export type CalendarItem = {
  id: string
  laneId: string
  title: string
  detail: string
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string
  url: string
  href: string | null
  attendees: CalendarAttendee[]
  cancelled: boolean
}

export type CalendarSnapshot = {
  month: string
  lanes: CalendarLane[]
  items: CalendarItem[]
  sources: {
    id: string
    kind: CalendarSourceKind
    label: string
    externalId: string
    color: string
    enabled: boolean
    writable: boolean
    lastSyncedAt: string | null
    lastError: string
  }[]
  config: {
    google: boolean
    calCom: boolean
  }
}

export function monthWindow(month: string) {
  const [year, mon] = month.split("-").map(Number)
  const start = new Date(Date.UTC(year, mon - 1, 1))
  const end = new Date(Date.UTC(year, mon, 1))
  // The grid can overhang the month by up to six days on either side; the extra
  // buffer also absorbs any timezone skew between server and viewer.
  const day = 86_400_000
  return {
    start,
    end,
    from: new Date(start.getTime() - 8 * day),
    to: new Date(end.getTime() + 8 * day),
  }
}
