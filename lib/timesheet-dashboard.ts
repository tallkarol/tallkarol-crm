import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"
import type { Invoice, Retainer } from "@/db/schema"
import { billingGaps, pace, retainerRateCents } from "@/lib/engagements"
import { occurredOnIn } from "@/lib/punch"
import { workspaceTimezone } from "@/lib/timezone"
import { pendingPunches } from "@/lib/punches"
import { formatWholeMoney } from "@/lib/revenue"
import { hoursByMonthSeries } from "@/lib/sheets"
import { currentMonth, shiftMonth } from "@/lib/timesheet"

/**
 * Everything the timesheet dashboard shows. Computed in one place so the tiles,
 * the engagement cards, and the attention list cannot disagree with each other.
 */

const WRITEOFF_KEY = "billing_gap_writeoffs"

export type EngagementCard = {
  clientId: string
  clientName: string
  clientSlug: string
  retainerName: string
  retainerSlug: string
  hours: number
  capHours: number
  rateCents: number | null
  valueCents: number | null
  overBy: number
  lastLoggedOn: string | null
}

export type AttentionItem = {
  id: string
  severity: "critical" | "warning" | "note"
  text: string
  amount: string
  href: string
  action: string
}

export type TimesheetDashboard = {
  month: string
  hoursThisMonth: number
  hoursLastMonth: number
  projectedHours: number
  unbilledCents: number
  unbilledHours: number
  unbilledMonths: number
  pendingPunches: number
  unloggedMeetings: number
  lastLoggedOn: string | null
  daysSinceLastEntry: number | null
  streakDays: number
  engagements: EngagementCard[]
  attention: AttentionItem[]
  series: Awaited<ReturnType<typeof hoursByMonthSeries>>
}

function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

function shiftDay(iso: string, delta: number) {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + delta))
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Consecutive days back from today (or the last logged day) with entries. */
function streakFrom(days: Set<string>, today: string) {
  let cursor = days.has(today) ? today : shiftDay(today, -1)
  if (!days.has(cursor)) return 0
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor = shiftDay(cursor, -1)
  }
  return streak
}

export async function timesheetDashboard(
  userId: string | null,
  now = new Date()
): Promise<TimesheetDashboard> {
  const tz = await workspaceTimezone()
  const today = occurredOnIn(now, tz)
  const month = currentMonth(now)
  const lastMonth = shiftMonth(month, -1)

  const [clientRows, invoiceRows, entryRows, writeoffRow, pending, series, meetingCount] =
    await Promise.all([
      db.query.clients.findMany({ with: { retainers: true } }),
      db.query.invoices.findMany(),
      db.query.timeEntries.findMany(),
      db.query.appSettings.findFirst({ where: eq(appSettings.key, WRITEOFF_KEY) }),
      pendingPunches(userId ?? undefined),
      hoursByMonthSeries(12, now),
      unloggedMeetingCount(),
    ])

  const writeoffs = Array.isArray(writeoffRow?.value)
    ? (writeoffRow.value as string[])
    : []
  const byClient = new Map(clientRows.map((row) => [row.id, row]))

  /* ---- hours ---- */
  const hoursIn = (key: string) =>
    entryRows
      .filter((row) => row.occurredOn.startsWith(key))
      .reduce((sum, row) => sum + Number(row.hours), 0)

  const hoursThisMonth = Math.round(hoursIn(month) * 100) / 100
  const hoursLastMonth = Math.round(hoursIn(lastMonth) * 100) / 100
  const projectedHours = Math.round(pace(hoursThisMonth, now).projected * 10) / 10

  /* ---- unbilled ---- */
  const rateByRetainer = new Map<string, number | null>()
  const allRetainers: Retainer[] = clientRows.flatMap((row) => row.retainers)
  for (const retainer of allRetainers) {
    rateByRetainer.set(retainer.id, retainerRateCents(retainer, invoiceRows))
  }

  const unbilled = entryRows.filter((row) => row.invoiceId == null)
  const unbilledHours =
    Math.round(unbilled.reduce((sum, row) => sum + Number(row.hours), 0) * 100) / 100
  const unbilledCents = unbilled.reduce((sum, row) => {
    const rate = row.retainerId ? rateByRetainer.get(row.retainerId) : null
    return sum + (rate ? Math.round(Number(row.hours) * rate) : 0)
  }, 0)
  const unbilledMonths = new Set(unbilled.map((row) => row.occurredOn.slice(0, 7))).size

  /* ---- cadence ---- */
  const days = new Set(entryRows.map((row) => row.occurredOn))
  const lastLoggedOn =
    entryRows.length > 0
      ? entryRows.reduce((latest, row) =>
          row.occurredOn > latest ? row.occurredOn : latest
        , entryRows[0].occurredOn)
      : null
  const daysSinceLastEntry = lastLoggedOn ? daysBetween(lastLoggedOn, today) : null

  /* ---- engagement cards: live retainers only ---- */
  const engagements: EngagementCard[] = []
  for (const client of clientRows) {
    const retainer = client.retainers.find((row) => row.status === "active")
    if (!retainer) continue
    const monthEntries = entryRows.filter(
      (row) => row.clientId === client.id && row.occurredOn.startsWith(month)
    )
    const hours =
      Math.round(monthEntries.reduce((sum, row) => sum + Number(row.hours), 0) * 100) /
      100
    const rate = rateByRetainer.get(retainer.id) ?? null
    const clientEntries = entryRows.filter((row) => row.clientId === client.id)
    engagements.push({
      clientId: client.id,
      clientName: client.name,
      clientSlug: client.slug,
      retainerName: retainer.name,
      retainerSlug: retainer.slug,
      hours,
      capHours: retainer.hoursPerMonth,
      rateCents: rate,
      valueCents: rate != null ? Math.round(hours * rate) : null,
      overBy: Math.max(0, Math.round((hours - retainer.hoursPerMonth) * 100) / 100),
      lastLoggedOn:
        clientEntries.length > 0
          ? clientEntries.reduce(
              (latest, row) => (row.occurredOn > latest ? row.occurredOn : latest),
              clientEntries[0].occurredOn
            )
          : null,
    })
  }
  engagements.sort((a, b) => b.hours - a.hours)

  /* ---- attention ---- */
  const attention: AttentionItem[] = []

  const gaps = billingGaps(
    allRetainers.filter((row) => row.status !== "ended"),
    entryRows,
    invoiceRows,
    writeoffs,
    now
  )
  for (const gap of gaps) {
    const client = clientRows.find((row) =>
      row.retainers.some((r) => r.id === gap.retainerId)
    )
    attention.push({
      id: `gap:${gap.retainerId}:${gap.month}`,
      severity: "critical",
      text: `${monthName(gap.month)} · ${client?.name ?? gap.retainerName} — ${gap.hours} hr logged, never invoiced`,
      amount: gap.valueCents != null ? formatCents(gap.valueCents) : `${gap.hours} hr`,
      href: client ? `/timesheet/${client.slug}/${gap.month}` : "/timesheet/sheets",
      action: "Invoice",
    })
  }

  if (pending.length > 0) {
    const hours = pending.reduce((sum, punch) => sum + punch.hours, 0)
    const oldest = pending[0]
    attention.push({
      id: "punches",
      severity: "warning",
      text: `${pending.length} ${pending.length === 1 ? "punch is" : "punches are"} waiting since ${shortDay(oldest.occurredOn)}`,
      amount: `${hours.toFixed(2)} hr`,
      href: "/timesheet/review",
      action: "Review",
    })
  }

  for (const engagement of engagements) {
    if (engagement.overBy <= 0) continue
    attention.push({
      id: `cap:${engagement.clientId}`,
      severity: "warning",
      text: `${engagement.clientName} is ${engagement.overBy} hr over its monthly cap`,
      amount:
        engagement.rateCents != null
          ? formatCents(Math.round(engagement.overBy * engagement.rateCents))
          : `${engagement.overBy} hr`,
      href: `/timesheet/${engagement.clientSlug}/${month}`,
      action: "Sheet",
    })
  }

  const blank = entryRows.filter(
    (row) => !row.summary.trim() && row.occurredOn >= shiftMonth(month, -2)
  )
  if (blank.length > 0) {
    const hours = blank.reduce((sum, row) => sum + Number(row.hours), 0)
    attention.push({
      id: "blank",
      severity: "note",
      text: `${blank.length} recent ${blank.length === 1 ? "entry has" : "entries have"} no summary line`,
      amount: `${Math.round(hours * 100) / 100} hr`,
      href: "/timesheet/entries?missing=summary",
      action: "Fix",
    })
  }

  if (meetingCount > 0) {
    attention.push({
      id: "meetings",
      severity: "note",
      text: `${meetingCount} matched ${meetingCount === 1 ? "meeting is" : "meetings are"} not on the timesheet`,
      amount: "",
      href: "/timesheet/review?tab=meetings",
      action: "Review",
    })
  }

  return {
    month,
    hoursThisMonth,
    hoursLastMonth,
    projectedHours,
    unbilledCents,
    unbilledHours,
    unbilledMonths,
    pendingPunches: pending.length,
    unloggedMeetings: meetingCount,
    lastLoggedOn,
    daysSinceLastEntry,
    streakDays: streakFrom(days, today),
    engagements,
    attention,
    series,
  }
}

/** Cheap count so the dashboard does not pay for the full meeting match. */
async function unloggedMeetingCount() {
  const { meetingProposals } = await import("@/lib/meetings")
  try {
    const proposals = await meetingProposals()
    return proposals.length
  } catch {
    return 0
  }
}

function formatCents(cents: number) {
  return formatWholeMoney(cents)
}

function monthName(key: string) {
  const [year, month] = key.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

function shortDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}
