import { and, desc, gte, isNull, or } from "drizzle-orm"
import { db } from "@/db"
import { agentSessions } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import { ROUTES } from "@/lib/nav"
import { roundRobinByClient } from "@/lib/widget"

/**
 * The Agent Ledger widget.
 *
 * Every Claude Code / Cursor conversation meters itself into `agent_sessions`;
 * `/log-session` turns the ones worth billing into `time_entries`, linked back
 * through `time_entry_sessions`. This is the view over that gap.
 *
 * Hours only. `meter_hours` and `share_hours` are the two numbers here and the
 * ratio between them is the whole point of the tile — a rate never enters, so
 * the widget cannot leak the book the way `lib/widget-revenue.ts` explains.
 *
 * Sized for the real shape of the data: 37 sessions in a week, of which one is
 * usually unconverted. The queue is the small part. `totals.share` and the
 * per-client volume are what the tile actually draws, so both are always
 * present and both are meaningful when `unconverted` is empty.
 */

/* ------------------------------------------------------------------ types */

export type AgentClientRow = {
  /** Client display name, or "No client" for the unassigned bucket. */
  client: string
  /** Client slug; "" for the unassigned bucket. */
  slug: string
  color: string
  meteredHours: number
  billedHours: number
  /** billedHours / meteredHours, clamped to 0..1. */
  share: number
  sessions: number
  unconverted: number
}

export type AgentUnconvertedRow = {
  sessionRef: string
  /** claude | cursor — whatever the hook recorded. */
  surface: string
  /** The conversation's title. "" when the summarizer never named it. */
  name: string
  client: string
  slug: string
  color: string
  /** Metered hours — what the POST bills if it is not given an override. */
  hours: number
  startedAt: string | null
  endedAt: string | null
  /** The model-written summary. "" when the summarizer never ran. */
  summary: string
  /** Opens the session peek in the CRM. */
  href: string
}

export type AgentSurfaceRow = {
  surface: string
  sessions: number
  meteredHours: number
}

export type AgentPayload = {
  generatedAt: string
  window: {
    /** Days requested, clamped to 1..90. */
    days: number
    /** Start of the rolling window, ISO. */
    since: string
    /** Same instant as `generatedAt`, named for the axis label. */
    until: string
  }
  totals: {
    /** Everything the meters recorded in the window. */
    meteredHours: number
    /** How much of it reached a timesheet. */
    billedHours: number
    /** billedHours / meteredHours, clamped to 0..1 — the dial. */
    share: number
  }
  /** One row per client, metered hours descending. Sums to `totals`. */
  byClient: AgentClientRow[]
  /** The queue: sessions with a client and no timesheet link, newest first. */
  unconverted: AgentUnconvertedRow[]
  /** Volume by surface, sessions descending — filler when the queue is empty. */
  surfaces: AgentSurfaceRow[]
  counts: {
    sessions: number
    converted: number
    unconverted: number
    /** Distinct clients that had a session in the window. */
    clients: number
  }
}

/* ---------------------------------------------------------------- helpers */

const DEFAULT_DAYS = 7
const MAX_DAYS = 90
/** A tile shows three rows; twelve is enough to scroll and cheap to encode. */
const UNCONVERTED_LIMIT = 12

/** `?days=` → a sane window. Junk, missing and out-of-range all fall to 7. */
export function agentWindowDays(raw: string | null | undefined): number {
  const n = Number.parseInt((raw ?? "").trim(), 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS
  return Math.min(n, MAX_DAYS)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/**
 * Three decimals, clamped. A session can be billed for more than it metered —
 * the meter is working data, the invoice is a judgement — and a Gauge bound to
 * 0...1 renders that as an overflow rather than a number. Clamped here so the
 * client never has to.
 */
function shareOf(part: number, whole: number) {
  if (!(whole > 0)) return 0
  return Math.min(1, Math.max(0, Math.round((part / whole) * 1000) / 1000))
}

/* ------------------------------------------------------------------ build */

type SessionRow = {
  sessionRef: string
  surface: string
  name: string
  summary: string
  meterHours: string
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date
  client: { name: string; slug: string } | null
  entries: { shareHours: string }[]
}

async function sessionsSince(since: Date) {
  return (await db.query.agentSessions.findMany({
    where: or(
      gte(agentSessions.startedAt, since),
      // A session the hooks never stamped a start on still happened — fall
      // back to when the row was written so it is not silently dropped.
      and(isNull(agentSessions.startedAt), gte(agentSessions.createdAt, since))
    ),
    columns: {
      sessionRef: true,
      surface: true,
      name: true,
      summary: true,
      meterHours: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
    },
    with: {
      client: { columns: { name: true, slug: true } },
      entries: { columns: { shareHours: true } },
    },
    orderBy: [desc(agentSessions.startedAt)],
    limit: 500,
  })) as unknown as SessionRow[]
}

export function sessionHref(sessionRef: string) {
  return `${ROUTES.timesheetReview}?peek=session:${encodeURIComponent(sessionRef)}`
}

/* -------------------------------------------------------------------- memo */

/**
 * Same reasoning as `cachedDelivery` in `lib/widget.ts`: several widget kinds
 * wake on one cadence and arrive together, and Railway runs a single web
 * process. Keyed by window so `?days=30` does not serve the 7-day answer.
 * `invalidateAgentLedger()` drops it after a conversion so the queue does not
 * still show the row that was just billed.
 */
const TTL_MS = 60_000
const memo = new Map<number, { at: number; value: AgentPayload }>()

export function invalidateAgentLedger() {
  memo.clear()
}

export async function widgetAgent(
  days = DEFAULT_DAYS,
  now = new Date()
): Promise<AgentPayload> {
  const hit = memo.get(days)
  if (hit && now.getTime() - hit.at < TTL_MS) return hit.value

  await ensureClientColors()

  const since = new Date(now.getTime() - days * 86_400_000)
  const rows = await sessionsSince(since)

  type Bucket = {
    client: string
    slug: string
    metered: number
    billed: number
    sessions: number
    unconverted: number
  }
  const byClient = new Map<string, Bucket>()
  const bySurface = new Map<string, { sessions: number; metered: number }>()

  let meteredTotal = 0
  let billedTotal = 0
  let convertedCount = 0
  const queue: (AgentUnconvertedRow & { groupKey: string; sortAt: number })[] = []

  for (const row of rows) {
    const metered = Number(row.meterHours) || 0
    const billed = row.entries.reduce((sum, e) => sum + (Number(e.shareHours) || 0), 0)
    const converted = row.entries.length > 0

    meteredTotal += metered
    billedTotal += billed
    if (converted) convertedCount += 1

    // A clientless session still metered real hours, so it gets a bucket of
    // its own rather than vanishing — otherwise `byClient` would not sum to
    // `totals` and the tile's two halves would disagree.
    const slug = row.client?.slug ?? ""
    const bucket = byClient.get(slug)
    if (bucket) {
      bucket.metered += metered
      bucket.billed += billed
      bucket.sessions += 1
      if (!converted) bucket.unconverted += 1
    } else {
      byClient.set(slug, {
        client: row.client?.name ?? "No client",
        slug,
        metered,
        billed,
        sessions: 1,
        unconverted: converted ? 0 : 1,
      })
    }

    const surface = row.surface || "claude"
    const s = bySurface.get(surface)
    if (s) {
      s.sessions += 1
      s.metered += metered
    } else {
      bySurface.set(surface, { sessions: 1, metered })
    }

    // Only a session with a client can be converted — `logAgentTime` needs one
    // to resolve a target — so a clientless session is never queued.
    if (!converted && row.client) {
      queue.push({
        sessionRef: row.sessionRef,
        surface,
        name: row.name ?? "",
        client: row.client.name,
        slug: row.client.slug,
        color: clientColor(row.client.slug),
        hours: round2(metered),
        startedAt: row.startedAt?.toISOString() ?? null,
        endedAt: row.endedAt?.toISOString() ?? null,
        summary: row.summary ?? "",
        href: sessionHref(row.sessionRef),
        groupKey: row.client.slug,
        sortAt: (row.endedAt ?? row.startedAt ?? row.createdAt).getTime(),
      })
    }
  }

  // Newest first, then one client at a time. Today's queue is a single row, but
  // one long-running account can produce a dozen unconverted sessions in a bad
  // week and a tile of nothing but that account reads as an outage.
  queue.sort((a, b) => b.sortAt - a.sortAt)
  const unconverted: AgentUnconvertedRow[] = roundRobinByClient(queue)
    .slice(0, UNCONVERTED_LIMIT)
    .map((row) => ({
      sessionRef: row.sessionRef,
      surface: row.surface,
      name: row.name,
      client: row.client,
      slug: row.slug,
      color: row.color,
      hours: row.hours,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      summary: row.summary,
      href: row.href,
    }))

  const value: AgentPayload = {
    generatedAt: now.toISOString(),
    window: { days, since: since.toISOString(), until: now.toISOString() },
    totals: {
      meteredHours: round2(meteredTotal),
      billedHours: round2(billedTotal),
      share: shareOf(billedTotal, meteredTotal),
    },
    byClient: Array.from(byClient.values())
      .map((b) => ({
        client: b.client,
        slug: b.slug,
        color: clientColor(b.slug),
        meteredHours: round2(b.metered),
        billedHours: round2(b.billed),
        share: shareOf(b.billed, b.metered),
        sessions: b.sessions,
        unconverted: b.unconverted,
      }))
      .sort((a, b) => b.meteredHours - a.meteredHours || a.client.localeCompare(b.client)),
    unconverted,
    surfaces: Array.from(bySurface.entries())
      .map(([surface, s]) => ({
        surface,
        sessions: s.sessions,
        meteredHours: round2(s.metered),
      }))
      .sort((a, b) => b.sessions - a.sessions || a.surface.localeCompare(b.surface)),
    counts: {
      sessions: rows.length,
      converted: convertedCount,
      unconverted: rows.length - convertedCount,
      clients: byClient.size,
    },
  }

  memo.set(days, { at: now.getTime(), value })
  return value
}

/* ------------------------------------------------------------- conversion */

export type AgentConvertTarget = {
  sessionRef: string
  clientId: string
  projectId: string | null
  surface: string
  name: string
  summary: string
  meterHours: number
  startedAt: Date
  endedAt: Date
}

export type AgentConvertRefusal = { status: number; error: string }

/**
 * Everything `POST /api/widget/agent/log` needs before it is allowed to call
 * `logAgentTime`, or the reason it may not.
 *
 * The already-converted check is the one that matters: the route is one tap on
 * a widget and the row it writes is money. `logAgentTime`'s own
 * `clientRequestId` index catches two taps that race each other; this catches
 * the second tap a minute later, when the first has already landed and the
 * proposal id would otherwise read as a fresh one.
 */
export async function agentConvertTarget(
  sessionRef: string
): Promise<{ ok: true; data: AgentConvertTarget } | { ok: false } & AgentConvertRefusal> {
  const row = (await db.query.agentSessions.findFirst({
    where: (table, { eq }) => eq(table.sessionRef, sessionRef),
    columns: {
      sessionRef: true,
      surface: true,
      name: true,
      summary: true,
      meterHours: true,
      startedAt: true,
      endedAt: true,
      clientId: true,
      projectId: true,
    },
    with: { entries: { columns: { timeEntryId: true } } },
  })) as unknown as
    | {
        sessionRef: string
        surface: string
        name: string
        summary: string
        meterHours: string
        startedAt: Date | null
        endedAt: Date | null
        clientId: string | null
        projectId: string | null
        entries: { timeEntryId: string }[]
      }
    | undefined

  if (!row) {
    return { ok: false, status: 404, error: `No agent session ${sessionRef}.` }
  }
  if (row.entries.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "That session is already on a timesheet. Nothing to convert.",
    }
  }
  if (!row.clientId) {
    return {
      ok: false,
      status: 422,
      error: "That session has no client. Pin one in the CRM before billing it.",
    }
  }
  if (!row.startedAt || !row.endedAt) {
    return {
      ok: false,
      status: 422,
      error: "That session has no start and end. Only a finished session can be billed.",
    }
  }

  return {
    ok: true,
    data: {
      sessionRef: row.sessionRef,
      clientId: row.clientId,
      projectId: row.projectId,
      surface: row.surface || "claude",
      name: row.name ?? "",
      summary: row.summary ?? "",
      meterHours: Number(row.meterHours) || 0,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
    },
  }
}

/**
 * The proposal id a widget tap bills under.
 *
 * Deliberately keyed on the session alone and not on the hours: two taps a
 * second apart carry the same id, so the unique index on
 * (user_id, client_request_id) turns the loser into a replay instead of a
 * second billable row. A later tap with different hours hits the
 * already-converted guard above, and if it somehow slips past it,
 * `logAgentTime` refuses the mismatched body with a 409 rather than
 * double-billing.
 */
export function agentConvertRequestId(sessionRef: string) {
  return `widget-agent:${sessionRef}`
}
