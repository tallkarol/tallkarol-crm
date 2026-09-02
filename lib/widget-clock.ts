import { and, desc, eq, gte, lte } from "drizzle-orm"
import { db } from "@/db"
import { timeEntries } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import { roundRobinByClient } from "@/lib/widget"
import { occurredOnIn } from "@/lib/punch"
import {
  pendingPunchCount,
  punchTargets,
  runningPunches,
  todayTotals,
  type PunchView,
} from "@/lib/punches"
import { workspaceTimezone } from "@/lib/timezone"

/**
 * The clock and timesheet widgets.
 *
 * Everything here leans on `lib/punches.ts` rather than touching `time_punches`
 * directly — the no-duplicate-target rule, the timezone handling and the retry
 * guard all live there, and a second implementation would get the midnight
 * cases wrong.
 */

export type ClockTarget = {
  clientId: string
  clientName: string
  clientSlug: string
  projectId: string | null
  projectName: string | null
  label: string
  color: string
}

export type ClockRunning = {
  id: string
  clientId: string
  clientName: string
  clientSlug: string
  projectId: string | null
  projectName: string | null
  color: string
  startedAt: string
  startClock: string
  /** Whole minutes so far. The widget re-derives this as its timeline ticks. */
  minutes: number
  elapsed: string
  /** "long" once it passes the 8-hour mark — the forgot-to-clock-out case. */
  flags: string[]
}

export type ClockPayload = {
  generatedAt: string
  timezone: string
  /** The oldest open punch. Kept so a widget built before concurrent punches still decodes. */
  running: ClockRunning | null
  /** Every open punch, oldest first. */
  runningPunches: ClockRunning[]
  today: { day: string; hours: number; entries: number }
  weekHours: number
  pendingApproval: number
  targets: ClockTarget[]
}

export type TimesheetPayload = {
  generatedAt: string
  timezone: string
  today: number
  week: number
  month: number
  /** Whether a punch is open right now, so the tile can say "and counting". */
  running: boolean
  /** Last seven days including today, oldest first. */
  days: { day: string; weekday: string; hours: number }[]
  /** This month, biggest first. */
  clients: { client: string; slug: string; color: string; hours: number }[]
  pendingApproval: number
  lastLoggedOn: string | null
}

/* ------------------------------------------------------------------ dates */

function iso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function shift(d: Date, days: number) {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

/** Monday-first, matching how the CRM's own week views read. */
function weekStart(d: Date) {
  const offset = (d.getDay() + 6) % 7
  return shift(d, -offset)
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

/* ------------------------------------------------------------------ clock */

export async function widgetClock(
  userId: string,
  now = new Date()
): Promise<ClockPayload> {
  await ensureClientColors()
  const tz = await workspaceTimezone()

  const [running, today, targets, pending] = await Promise.all([
    runningPunches(userId),
    todayTotals(userId),
    punchTargets(userId),
    pendingPunchCount(userId),
  ])

  const week = await sumHours(userId, iso(weekStart(now)), iso(now))
  const open = running.map(shapeRunning)

  return {
    generatedAt: now.toISOString(),
    timezone: tz,
    running: open[0] ?? null,
    runningPunches: open,
    today,
    weekHours: round(week),
    pendingApproval: pending,
    // One row per client before any client repeats. `punchTargets` orders by
    // recency, which is right, but the medium tile only shows three — and two
    // Mineralife rows plus a Zemvelo one hides the retainer with the largest
    // ceiling. Same rule the task rows follow.
    targets: roundRobinByClient(
      targets.map((t) => ({ ...t, groupKey: t.clientSlug }))
    )
      .slice(0, 12)
      .map((t) => ({
        clientId: t.clientId,
        clientName: t.clientName,
        clientSlug: t.clientSlug,
        projectId: t.projectId,
        projectName: t.projectName,
        label: t.label,
        color: clientColor(t.clientSlug),
      })),
  }
}

function shapeRunning(punch: PunchView): ClockRunning {
  return {
    id: punch.id,
    clientId: punch.clientId,
    clientName: punch.clientName,
    clientSlug: punch.clientSlug,
    projectId: punch.projectId,
    projectName: punch.projectName,
    color: clientColor(punch.clientSlug),
    startedAt: punch.startedAt,
    startClock: punch.startClock,
    minutes: punch.minutes,
    elapsed: punch.elapsed,
    flags: punch.flags,
  }
}

/* -------------------------------------------------------------- timesheet */

export async function widgetTimesheet(
  userId: string,
  now = new Date()
): Promise<TimesheetPayload> {
  await ensureClientColors()
  const tz = await workspaceTimezone()
  const today = occurredOnIn(now, tz)

  const from = iso(shift(now, -6))
  const [rows, monthRows, open, pending] = await Promise.all([
    db
      .select({ day: timeEntries.occurredOn, hours: timeEntries.hours })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, userId),
          gte(timeEntries.occurredOn, from),
          lte(timeEntries.occurredOn, today)
        )
      ),
    db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.occurredOn, iso(monthStart(now)))
      ),
      columns: { hours: true, occurredOn: true },
      with: { client: { columns: { name: true, slug: true } } },
    }),
    runningPunches(userId),
    pendingPunchCount(userId),
  ])

  // Every one of the last seven days, including the ones with nothing on them:
  // a gap is the signal, so it must not be silently skipped.
  const byDay = new Map<string, number>()
  for (const row of rows) {
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + Number(row.hours))
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = shift(now, -(6 - i))
    const key = iso(date)
    return {
      day: key,
      weekday: date.toLocaleDateString("en-US", { weekday: "narrow" }),
      hours: round(byDay.get(key) ?? 0),
    }
  })

  const weekFrom = iso(weekStart(now))
  const byClient = new Map<string, { name: string; slug: string; hours: number }>()
  let month = 0
  for (const row of monthRows as unknown as {
    hours: string
    occurredOn: string
    client: { name: string; slug: string } | null
  }[]) {
    const hours = Number(row.hours)
    month += hours
    const slug = row.client?.slug ?? ""
    const entry = byClient.get(slug)
    if (entry) entry.hours += hours
    else byClient.set(slug, { name: row.client?.name ?? "—", slug, hours })
  }

  const lastLogged = await db.query.timeEntries.findFirst({
    where: eq(timeEntries.userId, userId),
    columns: { occurredOn: true },
    orderBy: [desc(timeEntries.occurredOn)],
  })

  return {
    generatedAt: now.toISOString(),
    timezone: tz,
    today: round(byDay.get(today) ?? 0),
    week: round(await sumHours(userId, weekFrom, today)),
    month: round(month),
    running: open.length > 0,
    days,
    clients: Array.from(byClient.values())
      .map((c) => ({
        client: c.name,
        slug: c.slug,
        color: clientColor(c.slug),
        hours: round(c.hours),
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5),
    pendingApproval: pending,
    lastLoggedOn: lastLogged?.occurredOn ?? null,
  }
}

async function sumHours(userId: string, from: string, to: string) {
  const rows = await db
    .select({ hours: timeEntries.hours })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.occurredOn, from),
        lte(timeEntries.occurredOn, to)
      )
    )
  return rows.reduce((sum, row) => sum + Number(row.hours), 0)
}
