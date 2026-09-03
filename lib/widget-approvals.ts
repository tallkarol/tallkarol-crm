import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import { ROUTES } from "@/lib/nav"
import { FLAG_LABEL, approvalBlocker, type PunchFlag } from "@/lib/punch"
import { pendingPunches, todayTotals, type PunchView } from "@/lib/punches"
import { workspaceTimezone } from "@/lib/timezone"
import { roundRobinByClient } from "@/lib/widget"

/**
 * The "Ready to Approve" widget — the stopped-punch queue, decided server-side.
 *
 * Built on `pendingPunches()` and `todayTotals()` from `lib/punches.ts` rather
 * than a second query against `time_punches`: the timezone handling, the
 * wall-clock strings and the day a punch belongs to all live there, and a
 * reimplementation would get the midnight cases wrong in a place nobody looks.
 *
 * Two judgements the widget cannot make for itself are made here:
 *
 * - `approvable` mirrors `approvePunch()`'s own refusal conditions, so the tick
 *   is only offered when tapping it would actually write a billable row. The
 *   widget approves through `POST /api/widget/clock/punch` with no edits, which
 *   is exactly the case this predicate models — punch as it stands, its own
 *   note as the summary.
 * - `flags` names what must never be bulk-approved. Straight from
 *   `punchFlags()` (over eight hours, crossing midnight, no elapsed time),
 *   plus the day check the review page makes visually by grouping.
 *
 * The two are independent, and deliberately so: a flagged punch can still be
 * perfectly approvable one at a time — `approvePunch()` does not refuse it.
 * Flags are "look at this first", not "you may not".
 */

/* ------------------------------------------------------------------ types */

/**
 * `PunchFlag` is the repo's own vocabulary (`lib/punch.ts`). `previous_day` is
 * the one addition: a stopped punch whose day is not today. `punchFlags()` has
 * no equivalent — its `stale` only fires on a *running* punch — but TIMESHEET.md
 * puts "still running since yesterday" in the never-auto-approve list, and a
 * punch that has been sitting in the queue since a previous day is the stopped
 * form of the same worry: nobody remembers what those hours were.
 */
export type ApprovalFlag = PunchFlag | "previous_day"

const PREVIOUS_DAY_LABEL = "From an earlier day — check the hours before approving"

export type ApprovalPunch = {
  id: string
  clientName: string
  clientSlug: string
  /** The client's accent, so the queue can be scanned by whose work it is. */
  color: string
  projectName: string | null
  /** What it would bill, two decimals. Hours only — never money. */
  hours: number
  /** "1:13" — raw elapsed, shown beside the billed decimal. */
  elapsed: string
  /** Wall-clock in the workspace zone, e.g. "4:13 PM". */
  startClock: string
  /** Wall-clock in the workspace zone. Empty string if somehow unended. */
  endClock: string
  /** The day it belongs to, YYYY-MM-DD in the workspace zone. */
  occurredOn: string
  /** The punch note — what becomes the invoice line. May be "". */
  summary: string
  /** How it was punched: api · watch · web · clock · meeting. */
  source: string
  /** True only when `approvePunch()` would succeed on this punch as it stands. */
  approvable: boolean
  /** Why not, in Karol's own wording. Null when `approvable`. */
  blocker: string | null
  flags: ApprovalFlag[]
  /** One label per flag, same order — so the widget hard-codes no strings. */
  flagLabels: string[]
  href: string
}

export type ApprovalsPayload = {
  generatedAt: string
  timezone: string
  /** Today in the workspace zone, so a row can be badged without a second clock. */
  today: string
  /**
   * Newest first, then spread across clients: each client's own punches keep
   * their newest-first order and the newest punch overall still leads, but a
   * client sitting on a day of un-approved punches cannot fill every row of a
   * four-line tile. Capped at `MAX_ROWS`; `totals.count` is the real number.
   */
  punches: ApprovalPunch[]
  totals: {
    /** Every stopped punch, not just the ones returned. */
    count: number
    /** Their hours summed, two decimals. */
    hoursWaiting: number
    /** Approved hours already on today's sheet, from `todayTotals()`. */
    todayHours: number
  }
}

/** A widget tile draws four or five rows; twenty is a generous scroll. */
const MAX_ROWS = 20

/* ------------------------------------------------------------- predicates */

/**
 * `approvePunch()`'s refusal conditions, re-read from that function and nothing
 * else. It checks, in order: the punch exists, is not already approved, is not
 * still running, has an end time, that a changed project belongs to the same
 * client, and finally `approvalBlocker()`. The project check cannot fire here —
 * the widget sends no project override, so `projectId` is the punch's own — and
 * the `occurredOn` format check cannot fire either, because with no override it
 * is `occurredOnIn(start, tz)`, which is always YYYY-MM-DD.
 *
 * What is left is the status/end-time trio plus `approvalBlocker()`. Note that
 * `approvePunch()` bills `punchHours(start, end)`, which is exactly the `hours`
 * on a stopped `PunchView`, and summarises with the punch's own trimmed note —
 * so this reads the same inputs the write would.
 */
function verdictFor(punch: PunchView): { approvable: boolean; blocker: string | null } {
  if (punch.status === "approved") {
    return { approvable: false, blocker: "That punch is already approved." }
  }
  if (punch.status === "running") {
    return { approvable: false, blocker: "Clock out before approving this one." }
  }
  if (!punch.endedAt) {
    return { approvable: false, blocker: "That punch has no end time." }
  }
  const blocker = approvalBlocker({
    clientId: punch.clientId,
    projectId: punch.projectId,
    summary: punch.note,
    hours: punch.hours,
  })
  return { approvable: blocker === null, blocker }
}

function flagsFor(punch: PunchView, today: string): ApprovalFlag[] {
  const flags: ApprovalFlag[] = [...punch.flags]
  if (punch.occurredOn && punch.occurredOn < today) flags.push("previous_day")
  return flags
}

function labelFor(flag: ApprovalFlag): string {
  return flag === "previous_day" ? PREVIOUS_DAY_LABEL : FLAG_LABEL[flag]
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

/* ------------------------------------------------------------------ query */

export async function widgetApprovals(
  userId: string,
  now = new Date()
): Promise<ApprovalsPayload> {
  const [pending, today, timezone] = await Promise.all([
    pendingPunches(userId),
    todayTotals(userId),
    workspaceTimezone(),
  ])

  const totals = {
    count: pending.length,
    hoursWaiting: round(pending.reduce((sum, punch) => sum + punch.hours, 0)),
    todayHours: today.hours,
  }

  // The queue is empty most of the time — zero stopped punches is the normal
  // state of this database. Nothing to colour means the palette read is skipped
  // and the "Clear" tile costs three indexed lookups.
  if (pending.length === 0) {
    return {
      generatedAt: now.toISOString(),
      timezone,
      today: today.day,
      punches: [],
      totals,
    }
  }

  await ensureClientColors()

  // `pendingPunches()` is oldest first; the widget reads newest first.
  const newestFirst = [...pending].sort((a, b) =>
    a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0
  )

  // One row per client before any client repeats. `roundRobinByClient` keeps
  // each lane in the order it was given, so within a client the punches stay
  // newest first and the newest punch overall is still the first row.
  const spread = roundRobinByClient(
    newestFirst.map((punch) => ({ punch, groupKey: punch.clientSlug || punch.clientId }))
  ).slice(0, MAX_ROWS)

  const punches = spread.map(({ punch }) => {
    const verdict = verdictFor(punch)
    const flags = flagsFor(punch, today.day)
    return {
      id: punch.id,
      clientName: punch.clientName,
      clientSlug: punch.clientSlug,
      color: clientColor(punch.clientSlug),
      projectName: punch.projectName,
      hours: punch.hours,
      elapsed: punch.elapsed,
      startClock: punch.startClock,
      endClock: punch.endClock,
      occurredOn: punch.occurredOn,
      summary: punch.note,
      source: punch.source,
      approvable: verdict.approvable,
      blocker: verdict.blocker,
      flags,
      flagLabels: flags.map(labelFor),
      href: ROUTES.timesheetReview,
    }
  })

  return {
    generatedAt: now.toISOString(),
    timezone,
    today: today.day,
    punches,
    totals,
  }
}
