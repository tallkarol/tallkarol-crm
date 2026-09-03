import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm"
import { db } from "@/db"
import { timePunches } from "@/db/schema"
import type { TimePunch } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import { occurredOnIn } from "@/lib/punch"
import { toView } from "@/lib/punches"
import { roundRobinByClient } from "@/lib/widget"
import { workspaceTimezone } from "@/lib/timezone"

/**
 * The Day Ribbon widget: one local day drawn as a horizontal band, coloured by
 * client, with the untracked holes left visible.
 *
 * Why this lives here and not in `lib/punches.ts`: every reader there is
 * status-shaped on purpose — `runningPunches` is running-only, `pendingPunches`
 * is stopped-only, `recentPunches` is approved/discarded and ordered by recency
 * with a limit. A ribbon needs the opposite: one bounded window, every status
 * inside it, in clock order. That is a different question, so it gets its own
 * reader rather than a fifth flag on those.
 *
 * Punches are serialised through `toView()` from `lib/punches.ts`, so a segment
 * here carries exactly the same `startedAt` / `startClock` / `hours` that the
 * clock widget shows for the same row. No second formatting implementation.
 *
 * No money crosses this boundary — hours, minutes and counts only, the same
 * rule `lib/widget-revenue.ts` follows.
 */

/* ------------------------------------------------------------------ types */

export type DaySegment = {
  id: string
  /** Always "punch" today. Reserved so calendar or session bands can join later. */
  kind: "punch"
  clientName: string
  /** "" when the client row is missing; still safe to pass to `clientColor`. */
  clientSlug: string
  color: string
  projectName: string | null
  startedAt: string
  /** Null while the punch is still running. */
  endedAt: string | null
  /** "4:13 PM" in the workspace zone. */
  startClock: string
  /** "" while running — matching how `toView` serialises an open punch. */
  endClock: string
  /** Elapsed hours to two decimals; measured to `generatedAt` while running. */
  hours: number
  status: TimePunch["status"]
  /** api | watch | web | agent. Free text in the column, so decode as a string. */
  source: string
  running: boolean
}

export type DayGap = {
  startedAt: string
  endedAt: string
  minutes: number
}

export type DayTotals = {
  /** Sum of every counted segment's hours. Overlaps are counted twice — deliberate. */
  trackedHours: number
  /** Wall-clock hours covered by at least one punch. Overlaps counted once. */
  coveredHours: number
  /** Untracked minutes between the first and last counted segment, seams included. */
  untrackedMinutes: number
  /** Sum of `gaps` — the same holes, but only the ones at least 30 minutes wide. */
  gapMinutes: number
  /** `dayEnd` − `dayStart`, so the client can size the band without parsing dates. */
  windowMinutes: number
  /** Distinct clients among the counted segments. */
  clients: number
  /** Times the client changes walking the segments in start order. */
  switches: number
  segments: number
  running: number
  /** source === "agent" — metered work, ~90% of the rows in practice. */
  agentSegments: number
  /** Everything else: hand-clocked from the watch, the web or the API. */
  manualSegments: number
  /** Drawn, but excluded from every total above. */
  discardedSegments: number
  /** Segments dropped by the draw cap. Zero at any realistic volume. */
  omittedSegments: number
}

export type DayPayload = {
  generatedAt: string
  /** The local day this ribbon is for, YYYY-MM-DD. */
  day: string
  timezone: string
  /** Left edge of the band, ISO. */
  dayStart: string
  /** Right edge of the band, ISO. */
  dayEnd: string
  /** True when the day holds no punches at all and the window is the fallback. */
  empty: boolean
  /** Start order. Overlaps are normal — the client lanes them. */
  segments: DaySegment[]
  gaps: DayGap[]
  totals: DayTotals
}

/* ---------------------------------------------------------------- tunables */

/** Breathing room either side of the first and last punch. */
const PAD_MINUTES = 30

/** A band narrower than this is unreadable, however short the day was. */
const MIN_WINDOW_MINUTES = 120

/** Shorter than this is a seam between two punches, not a hole in the day. */
const MIN_GAP_MINUTES = 30

/** Fallback window for a day with nothing on it, in local minutes. */
const EMPTY_WINDOW = { from: 9 * 60, to: 17 * 60 }

/**
 * More bands than a widget can draw. Inert at present volume — the whole
 * `time_punches` table is under a hundred rows — but a runaway agent logging
 * every tool call would otherwise hand WidgetKit a thousand rectangles.
 */
const MAX_SEGMENTS = 60

const MINUTE = 60_000

/* ------------------------------------------------------------- local time */

/** The wall-clock reading of an instant in `timeZone`, expressed as a UTC ms. */
function zonedWallMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0")
  // Intl renders midnight as hour 24 in some engines.
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  )
}

/**
 * The instant at which a given local day reaches a given minute past midnight.
 *
 * Two passes: guess with the offset at the naive instant, then re-read the
 * offset at that guess. The second pass is what gets the March and November
 * boundaries right, where the offset at 00:00 UTC-naive is not the offset that
 * actually applies at the local hour being asked for.
 */
function instantForLocal(day: string, minutesIntoDay: number, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0) + minutesIntoDay * MINUTE
  const offsetAt = (ts: number) => zonedWallMs(new Date(ts), timeZone) - ts
  const first = wall - offsetAt(wall)
  return new Date(wall - offsetAt(first))
}

export function isDayString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/* --------------------------------------------------------------- intervals */

type Span = { start: number; end: number }

/** Overlapping punches collapse into one covered run before any gap is measured. */
function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Span[] = []
  for (const span of sorted) {
    const last = out[out.length - 1]
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end)
    else out.push({ ...span })
  }
  return out
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/* ------------------------------------------------------------------ reader */

type DayPunchRow = TimePunch & {
  client: { id: string; name: string; slug: string } | null
  project: { id: string; name: string } | null
}

/**
 * Every punch overlapping the local day, whatever its status.
 *
 * Overlap rather than "started on this day", so a punch opened at 23:40 and
 * still running at 00:20 shows up on both ribbons instead of disappearing from
 * the one it is actually covering.
 */
async function dayPunchRows(userId: string, from: Date, to: Date): Promise<DayPunchRow[]> {
  return (await db.query.timePunches.findMany({
    where: and(
      eq(timePunches.userId, userId),
      lt(timePunches.startedAt, to),
      or(isNull(timePunches.endedAt), gt(timePunches.endedAt, from))
    ),
    orderBy: [asc(timePunches.startedAt)],
    with: {
      client: { columns: { id: true, name: true, slug: true } },
      project: { columns: { id: true, name: true } },
    },
  })) as DayPunchRow[]
}

export async function widgetDay(
  userId: string,
  requestedDay?: string | null,
  now = new Date()
): Promise<DayPayload> {
  await ensureClientColors()
  const timezone = await workspaceTimezone()

  const day =
    requestedDay && isDayString(requestedDay) ? requestedDay : occurredOnIn(now, timezone)

  // The calendar day itself. Everything is clipped to this before the window is
  // sized, so a punch that crossed midnight cannot drag the band into yesterday.
  const localFrom = instantForLocal(day, 0, timezone).getTime()
  const localTo = instantForLocal(day, 24 * 60, timezone).getTime()

  const rows = await dayPunchRows(userId, new Date(localFrom), new Date(localTo))

  const shaped = rows.map((row) => {
    const view = toView(row, timezone, now)
    const start = new Date(view.startedAt).getTime()
    // A running punch is measured to `now`, clipped at that day's midnight so
    // one left open since yesterday does not paint today's whole band. A punch
    // that is *stopped* with no end time is a broken row, not an open one — it
    // draws as a zero-width tick, exactly as `toView` bills it at zero hours.
    const end = view.endedAt
      ? new Date(view.endedAt).getTime()
      : view.status === "running"
        ? Math.min(Math.max(now.getTime(), start), localTo)
        : start
    const segment: DaySegment = {
      id: view.id,
      kind: "punch",
      clientName: view.clientName,
      clientSlug: view.clientSlug,
      color: clientColor(view.clientSlug),
      projectName: view.projectName,
      startedAt: view.startedAt,
      endedAt: view.endedAt,
      startClock: view.startClock,
      endClock: view.endClock,
      hours: view.hours,
      status: view.status,
      source: view.source,
      running: view.status === "running",
    }
    return {
      segment,
      // Clipped to the calendar day — this is what sizes the band and measures
      // the holes. The segment itself keeps its true, unclipped timestamps.
      span: {
        start: Math.max(start, localFrom),
        end: Math.min(Math.max(end, start), localTo),
      },
      counted: view.status !== "discarded",
      groupKey: view.clientSlug || view.clientName,
    }
  })

  // A day with more punches than a widget can draw keeps breadth rather than
  // the first hour: pick by round robin across clients, then put the survivors
  // back in clock order, because a ribbon read out of order is not a ribbon.
  let kept = shaped
  let omitted = 0
  if (shaped.length > MAX_SEGMENTS) {
    const picked = new Set(
      roundRobinByClient(shaped)
        .slice(0, MAX_SEGMENTS)
        .map((item) => item.segment.id)
    )
    kept = shaped.filter((item) => picked.has(item.segment.id))
    omitted = shaped.length - kept.length
  }

  kept.sort(
    (a, b) =>
      a.span.start - b.span.start ||
      a.span.end - b.span.end ||
      a.segment.id.localeCompare(b.segment.id)
  )

  const counted = kept.filter((item) => item.counted)
  const covered = mergeSpans(counted.map((item) => item.span))

  /* ------------------------------------------------------------- window */

  let windowFrom: number
  let windowTo: number
  const empty = kept.length === 0

  if (empty) {
    windowFrom = instantForLocal(day, EMPTY_WINDOW.from, timezone).getTime()
    windowTo = instantForLocal(day, EMPTY_WINDOW.to, timezone).getTime()
  } else {
    // Sized from what actually happened, not from an office day nobody works.
    const firstStart = Math.min(...kept.map((item) => item.span.start))
    const lastEnd = Math.max(...kept.map((item) => item.span.end))
    windowFrom = firstStart - PAD_MINUTES * MINUTE
    windowTo = lastEnd + PAD_MINUTES * MINUTE

    const short = MIN_WINDOW_MINUTES * MINUTE - (windowTo - windowFrom)
    if (short > 0) {
      windowFrom -= short / 2
      windowTo += short / 2
    }

    // Padding may never push the band off the calendar day, and clamping may
    // never push it off a punch.
    windowFrom = Math.min(Math.max(windowFrom, localFrom), firstStart)
    windowTo = Math.max(Math.min(windowTo, localTo), lastEnd)
  }

  /* --------------------------------------------------------------- gaps */

  const gaps: DayGap[] = []
  let untrackedMs = 0
  for (let i = 1; i < covered.length; i += 1) {
    const from = covered[i - 1].end
    const to = covered[i].start
    const ms = to - from
    if (ms <= 0) continue
    untrackedMs += ms
    // Sub-30-minute seams still count as untracked; they are just not drawn as
    // holes, because a two-minute notch reads as a rendering artifact.
    if (ms >= MIN_GAP_MINUTES * MINUTE) {
      gaps.push({
        startedAt: new Date(from).toISOString(),
        endedAt: new Date(to).toISOString(),
        minutes: Math.round(ms / MINUTE),
      })
    }
  }

  /* ------------------------------------------------------------- totals */

  const trackedHours = counted.reduce((sum, item) => sum + item.segment.hours, 0)
  const coveredMs = covered.reduce((sum, span) => sum + (span.end - span.start), 0)

  const clients = new Set(counted.map((item) => item.groupKey))
  let switches = 0
  for (let i = 1; i < counted.length; i += 1) {
    if (counted[i].groupKey !== counted[i - 1].groupKey) switches += 1
  }

  const segments = kept.map((item) => item.segment)

  return {
    generatedAt: now.toISOString(),
    day,
    timezone,
    dayStart: new Date(windowFrom).toISOString(),
    dayEnd: new Date(windowTo).toISOString(),
    empty,
    segments,
    gaps,
    totals: {
      trackedHours: round2(trackedHours),
      coveredHours: round2(coveredMs / 3_600_000),
      untrackedMinutes: Math.round(untrackedMs / MINUTE),
      gapMinutes: gaps.reduce((sum, gap) => sum + gap.minutes, 0),
      windowMinutes: Math.round((windowTo - windowFrom) / MINUTE),
      clients: clients.size,
      switches,
      segments: segments.length,
      running: segments.filter((s) => s.running).length,
      agentSegments: counted.filter((item) => item.segment.source === "agent").length,
      manualSegments: counted.filter((item) => item.segment.source !== "agent").length,
      discardedSegments: kept.length - counted.length,
      omittedSegments: omitted,
    },
  }
}
