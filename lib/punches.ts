import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  clients,
  invoices,
  projects,
  retainers,
  timeEntries,
  timePunches,
  agentSessions,
  timeEntrySessions,
} from "@/db/schema"
import type { TimePunch } from "@/db/schema"
import {
  approvalBlocker,
  elapsedLabel,
  occurredOnIn,
  parseInstant,
  parsePunchTime,
  punchFlags,
  punchHours,
  punchMinutes,
  resolveInstant,
  revisedHours,
  splitBlocker,
  wallClockIn,
  type PunchFlag,
  type PunchSource,
} from "@/lib/punch"
import { sheetLock } from "@/lib/sheets"
import { workspaceTimezone } from "@/lib/timezone"
import { hoursToString, invoiceNumberFor } from "@/lib/timesheet"

/**
 * Every operation on a punch, shared by the API routes and the server actions
 * so the watch and the browser cannot drift apart.
 */

export type PunchResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      status: number
      error: string
      /** On a 409 from `clockIn`: the punch already open on that target. */
      running?: PunchView
    }

export type PunchView = {
  id: string
  status: TimePunch["status"]
  startedAt: string
  endedAt: string | null
  clientId: string
  clientName: string
  clientSlug: string
  projectId: string | null
  projectName: string | null
  note: string
  source: string
  /** Whole minutes elapsed — live for a running punch. */
  minutes: number
  /** What it would bill at two decimals. */
  hours: number
  elapsed: string
  flags: PunchFlag[]
  /** Local day and wall-clock, resolved in the workspace timezone. */
  occurredOn: string
  startClock: string
  endClock: string
}

export type PunchTarget = {
  clientId: string
  clientName: string
  clientSlug: string
  projectId: string | null
  projectName: string | null
  label: string
  lastUsedAt: string | null
  /** Last day time was logged against this, punched or not. */
  lastLoggedOn: string | null
}

const UNIQUE_VIOLATION = "23505"

function isUniqueViolation(error: unknown, constraint?: string) {
  const code = (error as { code?: string } | null)?.code
  if (code !== UNIQUE_VIOLATION) return false
  if (!constraint) return true
  const detail = String(
    (error as { constraint_name?: string; message?: string }).constraint_name ??
      (error as { message?: string }).message ??
      ""
  )
  return detail.includes(constraint)
}

type PunchRow = TimePunch & {
  client: { id: string; name: string; slug: string } | null
  project: { id: string; name: string } | null
}

export function toView(row: PunchRow, timeZone: string, now = new Date()): PunchView {
  const start = new Date(row.startedAt)
  const end = row.endedAt ? new Date(row.endedAt) : null
  const measureTo = end ?? (row.status === "running" ? now : start)
  const minutes = punchMinutes(start, measureTo)
  return {
    id: row.id,
    status: row.status,
    startedAt: start.toISOString(),
    endedAt: end ? end.toISOString() : null,
    clientId: row.clientId,
    clientName: row.client?.name ?? "Unknown client",
    clientSlug: row.client?.slug ?? "",
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    note: row.note,
    source: row.source,
    minutes,
    hours: punchHours(start, measureTo),
    elapsed: elapsedLabel(minutes),
    flags: punchFlags(row, timeZone, now),
    occurredOn: occurredOnIn(start, timeZone),
    startClock: wallClockIn(start, timeZone),
    endClock: end ? wallClockIn(end, timeZone) : "",
  }
}

const withParties = {
  client: { columns: { id: true, name: true, slug: true } },
  project: { columns: { id: true, name: true } },
} as const

async function loadPunch(id: string) {
  return (await db.query.timePunches.findFirst({
    where: eq(timePunches.id, id),
    with: withParties,
  })) as PunchRow | undefined
}

/** Every open punch, oldest first. More than one can run at a time. */
export async function runningPunches(userId: string): Promise<PunchView[]> {
  const rows = (await db.query.timePunches.findMany({
    where: and(eq(timePunches.userId, userId), eq(timePunches.status, "running")),
    orderBy: [asc(timePunches.startedAt)],
    with: withParties,
  })) as PunchRow[]
  const tz = await workspaceTimezone()
  const now = new Date()
  return rows.map((row) => toView(row, tz, now))
}

/**
 * The oldest open punch, or null. Kept for callers that show one clock — the
 * watch status line, the timesheet widget's "and counting" — and for API
 * responses that predate concurrent punches.
 */
export async function runningPunch(userId: string): Promise<PunchView | null> {
  const [first] = await runningPunches(userId)
  return first ?? null
}

/** Stopped-but-not-yet-approved punches, oldest first — the review queue. */
export async function pendingPunches(userId?: string): Promise<PunchView[]> {
  const rows = (await db.query.timePunches.findMany({
    where: userId
      ? and(eq(timePunches.userId, userId), eq(timePunches.status, "stopped"))
      : eq(timePunches.status, "stopped"),
    orderBy: [asc(timePunches.startedAt)],
    with: withParties,
  })) as PunchRow[]
  const tz = await workspaceTimezone()
  const now = new Date()
  return rows.map((row) => toView(row, tz, now))
}

export async function recentPunches(
  userId: string,
  limit = 25
): Promise<PunchView[]> {
  const rows = (await db.query.timePunches.findMany({
    where: and(
      eq(timePunches.userId, userId),
      inArray(timePunches.status, ["approved", "discarded"])
    ),
    orderBy: [desc(timePunches.startedAt)],
    limit,
    with: withParties,
  })) as PunchRow[]
  const tz = await workspaceTimezone()
  const now = new Date()
  return rows.map((row) => toView(row, tz, now))
}

/** Approved hours logged today, in the workspace's zone. */
export async function todayTotals(userId: string) {
  const tz = await workspaceTimezone()
  const today = occurredOnIn(new Date(), tz)
  const rows = await db
    .select({ hours: timeEntries.hours })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.occurredOn, today)))
  const hours = rows.reduce((sum, row) => sum + Number(row.hours), 0)
  return {
    day: today,
    hours: Math.round(hours * 100) / 100,
    entries: rows.length,
  }
}

/**
 * What you can punch: every active project, plus a bare row for each client
 * with a live retainer — because plenty of work is maintenance with no project
 * behind it. Ordered by what you punched most recently.
 */
export async function punchTargets(userId: string): Promise<PunchTarget[]> {
  const [clientRows, projectRows, recent, logged] = await Promise.all([
    db.query.clients.findMany({
      orderBy: [asc(clients.name)],
      with: { retainers: true },
    }),
    db
      .select({
        id: projects.id,
        name: projects.name,
        clientId: projects.clientId,
      })
      .from(projects)
      .where(ne(projects.status, "complete"))
      .orderBy(asc(projects.name)),
    db
      .select({
        clientId: timePunches.clientId,
        projectId: timePunches.projectId,
        lastUsedAt: sql<string>`max(${timePunches.startedAt})`,
      })
      .from(timePunches)
      .where(and(eq(timePunches.userId, userId), ne(timePunches.status, "discarded")))
      .groupBy(timePunches.clientId, timePunches.projectId),
    // Logged time, as a fallback ordering signal. Punches are the better
    // signal, but there may be none — the clock is new, and everything before
    // it was entered by hand. Without this the list falls back to the
    // alphabet, which puts work last touched a year ago above the retainers
    // being worked this week.
    db
      .select({
        clientId: timeEntries.clientId,
        projectId: timeEntries.projectId,
        lastLoggedOn: sql<string>`max(${timeEntries.occurredOn})`,
      })
      .from(timeEntries)
      .where(eq(timeEntries.userId, userId))
      .groupBy(timeEntries.clientId, timeEntries.projectId),
  ])

  const byClient = new Map(clientRows.map((row) => [row.id, row]))
  const key = (clientId: string, projectId: string | null) =>
    `${clientId}:${projectId ?? ""}`
  const lastUsed = new Map(
    recent.map((row) => [key(row.clientId, row.projectId), row.lastUsedAt])
  )
  // Client-level too: time logged against a project still says that client is
  // live, which is what a bare retainer row wants to know.
  const lastLogged = new Map<string, string>()
  for (const row of logged) {
    if (!row.clientId) continue
    for (const k of [key(row.clientId, row.projectId), key(row.clientId, null)]) {
      const current = lastLogged.get(k)
      if (!current || current < row.lastLoggedOn) lastLogged.set(k, row.lastLoggedOn)
    }
  }

  const targets: PunchTarget[] = []

  for (const project of projectRows) {
    const client = byClient.get(project.clientId)
    if (!client) continue
    targets.push({
      clientId: client.id,
      clientName: client.name,
      clientSlug: client.slug,
      projectId: project.id,
      projectName: project.name,
      label: `${client.name} · ${project.name}`,
      lastUsedAt: lastUsed.get(key(client.id, project.id)) ?? null,
      lastLoggedOn: lastLogged.get(key(client.id, project.id)) ?? null,
    })
  }

  for (const client of clientRows) {
    const live = client.retainers.some((row) => row.status === "active")
    const punched = lastUsed.has(key(client.id, null))
    if (!live && !punched) continue
    targets.push({
      clientId: client.id,
      clientName: client.name,
      clientSlug: client.slug,
      projectId: null,
      projectName: null,
      label: `${client.name} · Retainer`,
      lastUsedAt: lastUsed.get(key(client.id, null)) ?? null,
      lastLoggedOn: lastLogged.get(key(client.id, null)) ?? null,
    })
  }

  return targets.sort((a, b) => {
    // Punched beats logged beats alphabetical.
    if (a.lastUsedAt && b.lastUsedAt) return a.lastUsedAt < b.lastUsedAt ? 1 : -1
    if (a.lastUsedAt) return -1
    if (b.lastUsedAt) return 1

    const aLogged = a.lastLoggedOn
    const bLogged = b.lastLoggedOn
    if (aLogged && bLogged) return aLogged < bLogged ? 1 : -1
    if (aLogged) return -1
    if (bLogged) return 1

    return a.label.localeCompare(b.label)
  })
}

/**
 * A punch always names a client. A project is optional, and when one is given
 * its own client wins — so a watch can send only a project id.
 */
async function resolveTarget(input: {
  clientId?: string | null
  projectId?: string | null
}): Promise<{ clientId: string; projectId: string | null } | { error: string }> {
  const projectId = input.projectId || null
  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    })
    if (!project) return { error: "That project does not exist." }
    if (input.clientId && input.clientId !== project.clientId) {
      return { error: "That project belongs to a different client." }
    }
    return { clientId: project.clientId, projectId: project.id }
  }

  if (!input.clientId) {
    return { error: "A punch needs a client. Send clientId or projectId." }
  }
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, input.clientId),
  })
  if (!client) return { error: "That client does not exist." }
  return { clientId: client.id, projectId: null }
}

export type ClockInInput = {
  userId: string
  deviceId?: string | null
  clientId?: string | null
  projectId?: string | null
  note?: string
  at?: unknown
  source?: PunchSource
  /**
   * Stop everything that is running and start this instead. Without it a new
   * punch simply runs alongside the others.
   */
  switchRunning?: boolean
  clientRequestId?: string | null
}

export async function clockIn(
  input: ClockInInput
): Promise<PunchResult<{ punch: PunchView; stopped: PunchView[] }>> {
  const instant = resolveInstant(input.at)
  if ("error" in instant) return { ok: false, status: 400, error: instant.error }

  const tz = await workspaceTimezone()
  const requestId = input.clientRequestId?.trim() || null

  // A retry over a flaky link must not open a second punch.
  if (requestId) {
    const existing = (await db.query.timePunches.findFirst({
      where: and(
        eq(timePunches.userId, input.userId),
        eq(timePunches.clientRequestId, requestId)
      ),
      with: withParties,
    })) as PunchRow | undefined
    if (existing) {
      return { ok: true, data: { punch: toView(existing, tz), stopped: [] } }
    }
  }

  const target = await resolveTarget(input)
  if ("error" in target) return { ok: false, status: 400, error: target.error }

  const running = (await db.query.timePunches.findMany({
    where: and(eq(timePunches.userId, input.userId), eq(timePunches.status, "running")),
    orderBy: [asc(timePunches.startedAt)],
    with: withParties,
  })) as PunchRow[]

  // Punches may overlap across clients, never on the same target: a second
  // tap on a running row is a double tap, not a second timer.
  const duplicate = running.find(
    (row) =>
      row.clientId === target.clientId && (row.projectId ?? null) === target.projectId
  )
  if (duplicate && !input.switchRunning) {
    return {
      ok: false,
      status: 409,
      error: "That one is already running.",
      running: toView(duplicate, tz),
    }
  }

  const stopped: PunchView[] = []
  if (input.switchRunning) {
    for (const row of running) {
      const closed = await stopRunning(row, instant.at)
      if (!closed.ok) return closed
      stopped.push(closed.data)
    }
  }

  const values = {
    userId: input.userId,
    clientId: target.clientId,
    projectId: target.projectId,
    startedAt: instant.at,
    status: "running" as const,
    note: (input.note ?? "").trim(),
    source: input.source ?? "api",
    deviceId: input.deviceId ?? null,
    clientRequestId: requestId,
  }

  let id: string
  try {
    const [created] = await db
      .insert(timePunches)
      .values(values)
      .returning({ id: timePunches.id })
    id = created.id
  } catch (error) {
    // The same request id landed twice at once. The index held; hand back
    // whichever insert won.
    if (requestId && isUniqueViolation(error)) {
      const winner = (await db.query.timePunches.findFirst({
        where: and(
          eq(timePunches.userId, input.userId),
          eq(timePunches.clientRequestId, requestId)
        ),
        with: withParties,
      })) as PunchRow | undefined
      if (winner) return { ok: true, data: { punch: toView(winner, tz), stopped } }
    }
    throw error
  }

  const row = await loadPunch(id)
  if (!row) return { ok: false, status: 500, error: "Could not read that punch back." }
  return { ok: true, data: { punch: toView(row, tz), stopped } }
}

async function stopRunning(
  row: PunchRow,
  at: Date
): Promise<PunchResult<PunchView>> {
  const start = new Date(row.startedAt)
  if (at.getTime() <= start.getTime()) {
    return {
      ok: false,
      status: 400,
      error: "The end time is before the punch started.",
    }
  }
  await db
    .update(timePunches)
    .set({ endedAt: at, status: "stopped" })
    .where(and(eq(timePunches.id, row.id), eq(timePunches.status, "running")))
  const fresh = await loadPunch(row.id)
  if (!fresh) return { ok: false, status: 500, error: "Could not read that punch back." }
  return { ok: true, data: toView(fresh, await workspaceTimezone()) }
}

export async function clockOut(input: {
  userId: string
  punchId?: string | null
  note?: string
  at?: unknown
}): Promise<PunchResult<PunchView>> {
  const instant = resolveInstant(input.at)
  if ("error" in instant) return { ok: false, status: 400, error: instant.error }

  let row: PunchRow | undefined
  if (input.punchId) {
    row = (await db.query.timePunches.findFirst({
      where: and(eq(timePunches.id, input.punchId), eq(timePunches.userId, input.userId)),
      with: withParties,
    })) as PunchRow | undefined
  } else {
    // No id means "the one that is running" — which only makes sense while
    // exactly one is. With several open, guessing would stop the wrong clock.
    const open = (await db.query.timePunches.findMany({
      where: and(eq(timePunches.userId, input.userId), eq(timePunches.status, "running")),
      orderBy: [asc(timePunches.startedAt)],
      with: withParties,
    })) as PunchRow[]
    if (open.length > 1) {
      return {
        ok: false,
        status: 409,
        error: `${open.length} punches are running. Send punchId to say which one.`,
      }
    }
    row = open[0]
  }

  if (!row) return { ok: false, status: 404, error: "Nothing is clocked in." }
  if (row.status !== "running") {
    return { ok: false, status: 409, error: "That punch is already stopped." }
  }

  const note = (input.note ?? "").trim()
  if (note) {
    await db.update(timePunches).set({ note }).where(eq(timePunches.id, row.id))
    row.note = note
  }
  return stopRunning(row, instant.at)
}

/** Edit a stopped punch before approving it — times, target, or summary. */
export async function updatePunch(input: {
  userId: string
  punchId: string
  note?: string
  projectId?: string | null
  clientId?: string | null
  startedAt?: string
  endedAt?: string
}): Promise<PunchResult<PunchView>> {
  const row = (await db.query.timePunches.findFirst({
    where: and(eq(timePunches.id, input.punchId), eq(timePunches.userId, input.userId)),
    with: withParties,
  })) as PunchRow | undefined
  if (!row) return { ok: false, status: 404, error: "Punch not found." }
  if (row.status === "approved") {
    return { ok: false, status: 409, error: "That punch is already approved." }
  }

  const patch: Partial<typeof timePunches.$inferInsert> = {}

  if (input.note !== undefined) patch.note = input.note.trim()

  if (input.clientId !== undefined || input.projectId !== undefined) {
    const target = await resolveTarget({
      clientId: input.clientId ?? (input.projectId ? null : row.clientId),
      projectId: input.projectId ?? null,
    })
    if ("error" in target) return { ok: false, status: 400, error: target.error }
    patch.clientId = target.clientId
    patch.projectId = target.projectId
  }

  const start = input.startedAt ? new Date(input.startedAt) : new Date(row.startedAt)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, status: 400, error: "Start time is not a valid timestamp." }
  }
  const end = input.endedAt
    ? new Date(input.endedAt)
    : row.endedAt
      ? new Date(row.endedAt)
      : null
  if (end && Number.isNaN(end.getTime())) {
    return { ok: false, status: 400, error: "End time is not a valid timestamp." }
  }
  if (end && end.getTime() <= start.getTime()) {
    return { ok: false, status: 400, error: "The end time is before the start time." }
  }
  if (input.startedAt) patch.startedAt = start
  if (input.endedAt) patch.endedAt = end

  await db.update(timePunches).set(patch).where(eq(timePunches.id, row.id))
  const fresh = await loadPunch(row.id)
  if (!fresh) return { ok: false, status: 500, error: "Could not read that punch back." }
  return { ok: true, data: toView(fresh, await workspaceTimezone()) }
}

/** Anything that can `insert` — the db itself or a transaction handle. */
type Writer = Pick<typeof db, "insert">

/** The retainer an approved entry files under: the active one, else the first. */
export async function activeRetainerFor(clientId: string) {
  const rows = await db.query.retainers.findMany({
    where: eq(retainers.clientId, clientId),
  })
  return rows.find((item) => item.status === "active") ?? rows[0] ?? null
}

/**
 * The one insert that turns time into money. `approvePunch` and
 * `logAgentTime` both come through here so the billable row is shaped
 * identically whoever wrote it.
 */
export async function insertApprovedEntry(
  tx: Writer,
  input: {
    userId: string | null
    source: "clock" | "agent"
    clientId: string
    retainerId: string | null
    projectId: string | null
    occurredOn: string
    startedAt: string
    endedAt: string
    hours: number
    summary: string
  }
): Promise<string> {
  const [entry] = await tx
    .insert(timeEntries)
    .values({
      userId: input.userId,
      source: input.source,
      clientId: input.clientId,
      retainerId: input.retainerId,
      projectId: input.projectId,
      occurredOn: input.occurredOn,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      hours: hoursToString(input.hours),
      summary: input.summary,
    })
    .returning({ id: timeEntries.id })
  return entry.id
}

export type AgentLogInput = {
  userId: string
  deviceId?: string | null
  clientId?: string | null
  clientSlug?: string | null
  projectId?: string | null
  projectSlug?: string | null
  occurredOn: string
  startedAt: unknown
  endedAt: unknown
  hours: number
  summary: string
  /** Audit trail for the punch: which conversations, which request ids. */
  note?: string
  /** Proposal hash from the caller. A replay returns the same rows. */
  clientRequestId: string
  /** Log into a month that already has an invoice. */
  force?: boolean
  /**
   * The conversations this row pays for and each one's share of the hours.
   * Additive metadata: it links `time_entry_sessions`, never changes the
   * number, and a replay with a different list is ignored.
   */
  sessions?: AgentLogSession[]
}

export type AgentLogSession = {
  ref: string
  hours: number
  name?: string
  surface?: string
  startedAt?: unknown
  endedAt?: unknown
  rawHours?: number
}

async function findAgentLog(userId: string, requestId: string) {
  const punch = (await db.query.timePunches.findFirst({
    where: and(
      eq(timePunches.userId, userId),
      eq(timePunches.clientRequestId, requestId)
    ),
    with: withParties,
  })) as PunchRow | undefined
  if (!punch) return null
  const entry = punch.timeEntryId
    ? await db.query.timeEntries.findFirst({
        where: eq(timeEntries.id, punch.timeEntryId),
      })
    : null
  return { punch, entry: entry ?? null }
}

/**
 * The sessions behind an agent entry. A stub `agent_sessions` row is made
 * for any ref not seen yet, so the link holds even when the summarizer
 * never ran; `POST /api/sessions` fills the summary in later.
 */
async function linkSessions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  entryId: string,
  target: { clientId: string; projectId: string | null },
  sessions: AgentLogSession[]
) {
  for (const s of sessions.slice(0, 50)) {
    const ref = typeof s.ref === "string" ? s.ref.trim().slice(0, 200) : ""
    if (!ref) continue
    const started = s.startedAt ? parseInstant(s.startedAt) : null
    const ended = s.endedAt ? parseInstant(s.endedAt) : null
    await tx
      .insert(agentSessions)
      .values({
        sessionRef: ref,
        surface: typeof s.surface === "string" ? s.surface.slice(0, 20) : "claude",
        name: typeof s.name === "string" ? s.name.slice(0, 300) : "",
        clientId: target.clientId,
        projectId: target.projectId,
        startedAt: started && "at" in started ? started.at : null,
        endedAt: ended && "at" in ended ? ended.at : null,
        meterHours:
          typeof s.rawHours === "number" ? (Math.round(s.rawHours * 100) / 100).toFixed(2) : "0",
      })
      .onConflictDoUpdate({
        target: agentSessions.sessionRef,
        set: {
          clientId: sql`coalesce(${agentSessions.clientId}, excluded.client_id)`,
          projectId: sql`coalesce(${agentSessions.projectId}, excluded.project_id)`,
          name: sql`case when ${agentSessions.name} = '' then excluded.name else ${agentSessions.name} end`,
          startedAt: sql`coalesce(${agentSessions.startedAt}, excluded.started_at)`,
          endedAt: sql`coalesce(${agentSessions.endedAt}, excluded.ended_at)`,
          meterHours: sql`greatest(${agentSessions.meterHours}, excluded.meter_hours)`,
          updatedAt: new Date(),
        },
      })
    await tx
      .insert(timeEntrySessions)
      .values({
        timeEntryId: entryId,
        sessionRef: ref,
        shareHours: (Math.round((typeof s.hours === "number" ? s.hours : 0) * 100) / 100).toFixed(2),
      })
      .onConflictDoNothing()
  }
}

/**
 * Agent hours, approved in the chat that proposed them. Writes the billable
 * entry and an already-approved punch that carries the real start/end and
 * the audit note, in one transaction — so "where did that 1.52 come from"
 * has an answer and nothing waits in the review queue a second time.
 *
 * Idempotent on `clientRequestId`: a replay with the same hours, day and
 * summary returns the existing rows; the same id with a different body is
 * a 409, because that is a bug upstream, not a retry.
 */
export async function logAgentTime(
  input: AgentLogInput
): Promise<PunchResult<{ punch: PunchView; timeEntryId: string; replayed: boolean }>> {
  const requestId = input.clientRequestId?.trim()
  if (!requestId) {
    return { ok: false, status: 400, error: "Send a clientRequestId — the proposal id." }
  }

  const tz = await workspaceTimezone()
  const hours = Math.round(input.hours * 100) / 100
  const summary = (input.summary ?? "").trim()
  const occurredOn = (input.occurredOn ?? "").trim()

  const sameAsStored = (entry: { hours: string; occurredOn: string; summary: string } | null) =>
    !!entry &&
    Number(entry.hours) === hours &&
    entry.occurredOn === occurredOn &&
    entry.summary === summary

  const existing = await findAgentLog(input.userId, requestId)
  if (existing) {
    if (sameAsStored(existing.entry) && existing.punch.timeEntryId) {
      return {
        ok: true,
        data: {
          punch: toView(existing.punch, tz),
          timeEntryId: existing.punch.timeEntryId,
          replayed: true,
        },
      }
    }
    return {
      ok: false,
      status: 409,
      error: `clientRequestId ${requestId} was already logged with different hours, day or summary. Propose again.`,
    }
  }

  // Slugs come from the caller's own client pins; ids are the CRM's. Both
  // are accepted, and a project always names its own client.
  let clientId = input.clientId ?? null
  let projectId = input.projectId ?? null
  if (!clientId && input.clientSlug) {
    const client = await db.query.clients.findFirst({
      where: eq(clients.slug, input.clientSlug),
    })
    if (!client) {
      return { ok: false, status: 404, error: `No client with slug "${input.clientSlug}".` }
    }
    clientId = client.id
  }
  if (!projectId && input.projectSlug) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.slug, input.projectSlug),
    })
    if (!project) {
      return { ok: false, status: 404, error: `No project with slug "${input.projectSlug}".` }
    }
    projectId = project.id
  }
  const target = await resolveTarget({ clientId, projectId })
  if ("error" in target) return { ok: false, status: 400, error: target.error }

  const start = parseInstant(input.startedAt)
  if ("error" in start) return { ok: false, status: 400, error: `startedAt: ${start.error}` }
  const end = parseInstant(input.endedAt)
  if ("error" in end) return { ok: false, status: 400, error: `endedAt: ${end.error}` }
  if (end.at.getTime() <= start.at.getTime()) {
    return { ok: false, status: 400, error: "The end time is before the start time." }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return { ok: false, status: 400, error: "occurredOn must be YYYY-MM-DD." }
  }
  if (occurredOn > occurredOnIn(new Date(), tz)) {
    return { ok: false, status: 400, error: "occurredOn is in the future." }
  }
  if (!summary) {
    return { ok: false, status: 422, error: "Agent hours always carry a summary." }
  }
  const blocker = approvalBlocker({
    clientId: target.clientId,
    projectId: target.projectId,
    summary,
    hours,
  })
  if (blocker) return { ok: false, status: 422, error: blocker }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, target.clientId),
  })
  if (!client) return { ok: false, status: 404, error: "That client does not exist." }

  if (!input.force) {
    const number = invoiceNumberFor(client.slug, occurredOn.slice(0, 7))
    const billed = await db.query.invoices.findFirst({
      where: eq(invoices.number, number),
    })
    if (billed) {
      return {
        ok: false,
        status: 409,
        error: `${number} already exists for that month. Send force:true to log into a billed month.`,
      }
    }
  }

  const retainer = await activeRetainerFor(target.clientId)
  const note = [summary, (input.note ?? "").trim()].filter(Boolean).join("\n\n")

  let punchId: string
  try {
    punchId = await db.transaction(async (tx) => {
      const entryId = await insertApprovedEntry(tx, {
        userId: input.userId,
        source: "agent",
        clientId: target.clientId,
        retainerId: retainer?.id ?? null,
        projectId: target.projectId,
        occurredOn,
        startedAt: wallClockIn(start.at, tz),
        endedAt: wallClockIn(end.at, tz),
        hours,
        summary,
      })
      await linkSessions(tx, entryId, target, input.sessions ?? [])
      const [created] = await tx
        .insert(timePunches)
        .values({
          userId: input.userId,
          clientId: target.clientId,
          projectId: target.projectId,
          startedAt: start.at,
          endedAt: end.at,
          status: "approved",
          note,
          source: "agent",
          deviceId: input.deviceId ?? null,
          clientRequestId: requestId,
          timeEntryId: entryId,
          approvedAt: new Date(),
          approvedBy: input.userId,
        })
        .returning({ id: timePunches.id })
      return created.id
    })
  } catch (error) {
    // Two submits raced on the same proposal. The index held; hand back
    // whichever won, under the same body-match rule as above.
    if (isUniqueViolation(error)) {
      const winner = await findAgentLog(input.userId, requestId)
      if (winner?.punch.timeEntryId && sameAsStored(winner.entry)) {
        return {
          ok: true,
          data: {
            punch: toView(winner.punch, tz),
            timeEntryId: winner.punch.timeEntryId,
            replayed: true,
          },
        }
      }
      return {
        ok: false,
        status: 409,
        error: `clientRequestId ${requestId} was already logged with a different body.`,
      }
    }
    throw error
  }

  const fresh = await loadPunch(punchId)
  if (!fresh?.timeEntryId) {
    return { ok: false, status: 500, error: "Could not read that punch back." }
  }
  return {
    ok: true,
    data: { punch: toView(fresh, tz), timeEntryId: fresh.timeEntryId, replayed: false },
  }
}

/**
 * The gate. Writes the billable `time_entries` row and marks the punch
 * approved — the only path by which a punch becomes money.
 */
export async function approvePunch(input: {
  punchId: string
  approvedBy: string
  summary?: string
  hours?: number
  projectId?: string | null
  occurredOn?: string
}): Promise<PunchResult<{ punch: PunchView; timeEntryId: string }>> {
  const row = await loadPunch(input.punchId)
  if (!row) return { ok: false, status: 404, error: "Punch not found." }
  if (row.status === "approved") {
    return { ok: false, status: 409, error: "That punch is already approved." }
  }
  if (row.status === "running") {
    return { ok: false, status: 409, error: "Clock out before approving this one." }
  }
  if (!row.endedAt) {
    return { ok: false, status: 409, error: "That punch has no end time." }
  }

  const tz = await workspaceTimezone()
  const start = new Date(row.startedAt)
  const end = new Date(row.endedAt)

  const projectId =
    input.projectId === undefined ? row.projectId : input.projectId || null
  if (projectId && projectId !== row.projectId) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    })
    if (!project || project.clientId !== row.clientId) {
      return { ok: false, status: 400, error: "That project belongs to another client." }
    }
  }

  const summary = (input.summary ?? row.note).trim()
  const hours = input.hours != null ? Math.round(input.hours * 100) / 100 : punchHours(start, end)

  const blocker = approvalBlocker({
    clientId: row.clientId,
    projectId,
    summary,
    hours,
  })
  if (blocker) return { ok: false, status: 422, error: blocker }

  const retainer = await activeRetainerFor(row.clientId)

  const occurredOn = input.occurredOn?.trim() || occurredOnIn(start, tz)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return { ok: false, status: 400, error: "That date is not valid." }
  }

  const timeEntryId = await db.transaction(async (tx) => {
    const entryId = await insertApprovedEntry(tx, {
      userId: row.userId,
      source: "clock",
      clientId: row.clientId,
      retainerId: retainer?.id ?? null,
      projectId,
      occurredOn,
      startedAt: wallClockIn(start, tz),
      endedAt: wallClockIn(end, tz),
      hours,
      summary,
    })

    await tx
      .update(timePunches)
      .set({
        status: "approved",
        note: summary,
        projectId,
        timeEntryId: entryId,
        approvedAt: new Date(),
        approvedBy: input.approvedBy,
      })
      .where(eq(timePunches.id, row.id))

    return entryId
  })

  const fresh = await loadPunch(row.id)
  if (!fresh) return { ok: false, status: 500, error: "Could not read that punch back." }
  return { ok: true, data: { punch: toView(fresh, tz), timeEntryId } }
}

/** Never a delete — "where did that hour go" should always have an answer. */
export async function discardPunch(input: {
  punchId: string
  userId: string
}): Promise<PunchResult<PunchView>> {
  const row = await loadPunch(input.punchId)
  if (!row) return { ok: false, status: 404, error: "Punch not found." }
  if (row.status === "approved") {
    return {
      ok: false,
      status: 409,
      error: "That punch is already on the timesheet. Delete the entry instead.",
    }
  }
  await db
    .update(timePunches)
    .set({ status: "discarded" })
    .where(eq(timePunches.id, row.id))
  const fresh = await loadPunch(row.id)
  if (!fresh) return { ok: false, status: 500, error: "Could not read that punch back." }
  return { ok: true, data: toView(fresh, await workspaceTimezone()) }
}

/** Count for the dashboard tile and the nav badge. */
export async function pendingPunchCount(userId?: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(timePunches)
    .where(
      userId
        ? and(eq(timePunches.userId, userId), eq(timePunches.status, "stopped"))
        : eq(timePunches.status, "stopped")
    )
  return Number(row?.count ?? 0)
}

/* ------------------------------------------------------------ after the fact */

/*
 * Changing punches that already left the review queue — approved ones whose
 * line is on the timesheet, discarded ones — plus splitting and dropping.
 * The review screen keeps its narrower updatePunch/discardPunch; these are
 * what the chat's punch tools call. Every write has a plan* twin that works
 * the change out without writing it, so the chat's preview card and the
 * write cannot disagree. See TIMESHEET.md, "After the fact".
 */

export type PunchLine = {
  id: string
  hours: number
  summary: string
  occurredOn: string
  projectId: string | null
  invoiceNumber: string | null
}

export type PunchLock = { number: string; status: string }

export type PunchDetail = PunchView & {
  timeEntryId: string | null
  /** The billable timesheet line, for an approved punch whose line still exists. */
  line: PunchLine | null
  /** The invoice that locks this punch's client-month, when one does. */
  lockedBy: PunchLock | null
}

/** The invoice that locks a client-month — the sheet's own rule (`sheetLock`). */
async function monthLock(
  clientId: string,
  month: string,
  invoiceId: string | null,
  cache?: Map<string, PunchLock | null>
): Promise<PunchLock | null> {
  if (invoiceId) {
    const own = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      columns: { number: true, status: true },
    })
    if (own && sheetLock(own).locked) return own
  }
  const key = `${clientId}:${month}`
  if (cache?.has(key)) return cache.get(key) ?? null
  const rows = await db.query.invoices.findMany({
    where: and(
      eq(invoices.clientId, clientId),
      sql`to_char(${invoices.issuedOn}, 'YYYY-MM') = ${month}`
    ),
    columns: { number: true, status: true },
  })
  const lock = rows.find((row) => sheetLock(row).locked) ?? null
  cache?.set(key, lock)
  return lock
}

async function withLines(rows: PunchRow[], tz: string): Promise<PunchDetail[]> {
  const entryIds = rows.map((r) => r.timeEntryId).filter((id): id is string => Boolean(id))
  const entries = entryIds.length
    ? await db.query.timeEntries.findMany({ where: inArray(timeEntries.id, entryIds) })
    : []
  const invoiceIds = entries.map((e) => e.invoiceId).filter((id): id is string => Boolean(id))
  const invoiceRows = invoiceIds.length
    ? await db.query.invoices.findMany({
        where: inArray(invoices.id, invoiceIds),
        columns: { id: true, number: true },
      })
    : []
  const cache = new Map<string, PunchLock | null>()
  const out: PunchDetail[] = []
  for (const row of rows) {
    const view = toView(row, tz)
    const entry = entries.find((e) => e.id === row.timeEntryId) ?? null
    const month = (entry?.occurredOn ?? view.occurredOn).slice(0, 7)
    out.push({
      ...view,
      timeEntryId: row.timeEntryId,
      line: entry
        ? {
            id: entry.id,
            hours: Number(entry.hours),
            summary: entry.summary,
            occurredOn: entry.occurredOn,
            projectId: entry.projectId,
            invoiceNumber: invoiceRows.find((i) => i.id === entry.invoiceId)?.number ?? null,
          }
        : null,
      lockedBy:
        row.status === "approved" && entry
          ? await monthLock(entry.clientId, month, entry.invoiceId, cache)
          : null,
    })
  }
  return out
}

/** Midnight of a local day, as an instant. */
function dayStart(day: string, tz: string): Date {
  const parsed = parsePunchTime("00:00", day, tz)
  if ("error" in parsed) throw new Error(parsed.error)
  return parsed.at
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Punches by status, local day range and client — the chat's list_punches. */
export async function findPunches(input: {
  userId: string
  statuses: TimePunch["status"][]
  fromDay?: string
  toDay?: string
  clientSlug?: string
  limit?: number
}): Promise<PunchResult<{ timeZone: string; punches: PunchDetail[] }>> {
  const tz = await workspaceTimezone()
  const where = [eq(timePunches.userId, input.userId), inArray(timePunches.status, input.statuses)]
  if (input.clientSlug) {
    const client = await db.query.clients.findFirst({ where: eq(clients.slug, input.clientSlug) })
    if (!client) return { ok: false, status: 404, error: `No client with slug "${input.clientSlug}".` }
    where.push(eq(timePunches.clientId, client.id))
  }
  const day = /^\d{4}-\d{2}-\d{2}$/
  if (input.fromDay) {
    if (!day.test(input.fromDay)) return { ok: false, status: 400, error: "`from` must be YYYY-MM-DD." }
    where.push(gte(timePunches.startedAt, dayStart(input.fromDay, tz)))
  }
  if (input.toDay) {
    if (!day.test(input.toDay)) return { ok: false, status: 400, error: "`to` must be YYYY-MM-DD." }
    where.push(sql`${timePunches.startedAt} < ${dayStart(nextDay(input.toDay), tz).toISOString()}::timestamptz`)
  }
  const rows = (await db.query.timePunches.findMany({
    where: and(...where),
    with: withParties,
    orderBy: [desc(timePunches.startedAt)],
    limit: Math.min(Math.max(input.limit ?? 40, 1), 100),
  })) as PunchRow[]
  return { ok: true, data: { timeZone: tz, punches: await withLines(rows, tz) } }
}

export async function punchDetail(userId: string, punchId: string): Promise<PunchDetail | null> {
  const row = (await db.query.timePunches.findFirst({
    where: and(eq(timePunches.id, punchId), eq(timePunches.userId, userId)),
    with: withParties,
  })) as PunchRow | undefined
  if (!row) return null
  const [detail] = await withLines([row], await workspaceTimezone())
  return detail
}

function lockError(lock: PunchLock) {
  return `Invoice ${lock.number} (${lock.status}) already covers that month. Send force: true only if Karol wants a billed line changed — the invoice itself is not re-issued.`
}

/* ---------- revise ---------- */

export type PunchRevision = {
  userId: string
  punchId: string
  startedAt?: Date
  endedAt?: Date
  clientId?: string
  /** null clears the project. */
  projectId?: string | null
  note?: string
  /** Approved punches: what the line bills, when it should differ from the clock span. */
  hours?: number
  /** Approved punches: the day the line is filed under. */
  occurredOn?: string
  /** A discarded punch goes back to Review. */
  reopen?: boolean
  /** Change a line in a month an invoice already locks. */
  force?: boolean
}

export type RevisionPlan = {
  before: PunchDetail
  status: TimePunch["status"]
  startedAt: Date
  endedAt: Date | null
  clientId: string
  projectId: string | null
  note: string
  /** Set when the approved punch's line changes with it. */
  line: { hours: number; occurredOn: string; retainerChanges: boolean } | null
  lock: PunchLock | null
  warnings: string[]
}

export async function planRevision(input: PunchRevision): Promise<PunchResult<RevisionPlan>> {
  const before = await punchDetail(input.userId, input.punchId)
  if (!before) return { ok: false, status: 404, error: "No punch with that id. Call list_punches for ids." }
  const tz = await workspaceTimezone()
  const now = Date.now()
  const warnings: string[] = []

  const oldStart = new Date(before.startedAt)
  const oldEnd = before.endedAt ? new Date(before.endedAt) : null
  const startedAt = input.startedAt ?? oldStart
  const endedAt = input.endedAt ?? oldEnd

  let status = before.status
  if (input.reopen) {
    if (before.status !== "discarded") {
      return { ok: false, status: 409, error: "Only a discarded punch can be sent back to Review." }
    }
    status = "stopped"
  }
  if (before.status === "running" && input.endedAt) status = "stopped"

  if (Number.isNaN(startedAt.getTime()) || (endedAt && Number.isNaN(endedAt.getTime()))) {
    return { ok: false, status: 400, error: "That time is not valid." }
  }
  if (endedAt && endedAt.getTime() <= startedAt.getTime()) {
    return { ok: false, status: 400, error: "The clock-out would be at or before the clock-in." }
  }
  if (startedAt.getTime() > now + 60_000 || (endedAt && endedAt.getTime() > now + 60_000)) {
    return { ok: false, status: 400, error: "That time is in the future." }
  }

  let clientId = before.clientId
  let projectId = before.projectId
  if (input.clientId !== undefined || input.projectId !== undefined) {
    const clientChanged = input.clientId !== undefined && input.clientId !== before.clientId
    const wantProject =
      input.projectId !== undefined ? input.projectId : clientChanged ? null : before.projectId
    const target = await resolveTarget({ clientId: input.clientId ?? (wantProject ? null : before.clientId), projectId: wantProject })
    if ("error" in target) return { ok: false, status: 400, error: target.error }
    clientId = target.clientId
    projectId = target.projectId
    if (clientChanged && before.projectId && input.projectId === undefined) {
      warnings.push("The project was cleared — it belonged to the old client.")
    }
  }

  const note = input.note !== undefined ? input.note.trim() : before.note
  const isLine = before.status === "approved" && before.line !== null

  if ((input.hours !== undefined || input.occurredOn !== undefined) && !isLine) {
    return {
      ok: false,
      status: 400,
      error: "hours and day only apply to a punch that is already on the timesheet. For one in review, change the clock times, or approve it with those values.",
    }
  }

  let line: RevisionPlan["line"] = null
  let lock: PunchLock | null = null
  if (isLine && before.line) {
    if (!endedAt) return { ok: false, status: 409, error: "An approved punch has to keep an end time." }
    const timesChanged =
      startedAt.getTime() !== oldStart.getTime() || endedAt.getTime() !== (oldEnd?.getTime() ?? 0)
    const hours = revisedHours({ explicit: input.hours, timesChanged, start: startedAt, end: endedAt, current: before.line.hours })
    const startMoved = startedAt.getTime() !== oldStart.getTime()
    const occurredOn =
      input.occurredOn ?? (startMoved ? occurredOnIn(startedAt, tz) : before.line.occurredOn)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      return { ok: false, status: 400, error: "The day must be YYYY-MM-DD." }
    }
    const blocker = approvalBlocker({ clientId, projectId, summary: note, hours })
    if (blocker) return { ok: false, status: 422, error: blocker }

    lock =
      before.lockedBy ??
      (clientId !== before.clientId || occurredOn.slice(0, 7) !== before.line.occurredOn.slice(0, 7)
        ? await monthLock(clientId, occurredOn.slice(0, 7), null)
        : null)
    if (lock && !input.force) return { ok: false, status: 409, error: lockError(lock) }
    if (lock) warnings.push(`Invoice ${lock.number} is already ${lock.status}; this changes a billed line, and the invoice is not re-issued.`)
    if (!timesChanged && input.hours === undefined && before.line.hours !== before.hours) {
      warnings.push(`The line keeps its hand-set ${before.line.hours.toFixed(2)} h.`)
    }
    line = { hours, occurredOn, retainerChanges: clientId !== before.clientId }
  } else if (before.status === "approved") {
    warnings.push("Its timesheet line was deleted earlier, so only the punch changes.")
  }

  return {
    ok: true,
    data: { before, status, startedAt, endedAt, clientId, projectId, note, line, lock, warnings },
  }
}

export async function revisePunch(input: PunchRevision): Promise<PunchResult<{ punch: PunchDetail; warnings: string[] }>> {
  const planned = await planRevision(input)
  if (!planned.ok) return planned
  const plan = planned.data
  const tz = await workspaceTimezone()

  await db.transaction(async (tx) => {
    await tx
      .update(timePunches)
      .set({
        status: plan.status,
        startedAt: plan.startedAt,
        endedAt: plan.endedAt,
        clientId: plan.clientId,
        projectId: plan.projectId,
        note: plan.note,
      })
      .where(eq(timePunches.id, plan.before.id))

    if (plan.line && plan.before.line && plan.endedAt) {
      const retainer = plan.line.retainerChanges ? await activeRetainerFor(plan.clientId) : undefined
      await tx
        .update(timeEntries)
        .set({
          clientId: plan.clientId,
          projectId: plan.projectId,
          ...(retainer !== undefined ? { retainerId: retainer?.id ?? null } : {}),
          occurredOn: plan.line.occurredOn,
          startedAt: wallClockIn(plan.startedAt, tz),
          endedAt: wallClockIn(plan.endedAt, tz),
          hours: hoursToString(plan.line.hours),
          summary: plan.note,
        })
        .where(eq(timeEntries.id, plan.before.line.id))
    }
  })

  const fresh = await punchDetail(input.userId, plan.before.id)
  if (!fresh) return { ok: false, status: 500, error: "Could not read that punch back." }
  return { ok: true, data: { punch: fresh, warnings: plan.warnings } }
}

/* ---------- split ---------- */

export type PunchSplit = {
  userId: string
  punchId: string
  at: Date
  /** Discard one side: the part before `at`, or the part after it. */
  drop?: "before" | "after" | null
  /** The second piece's summary and project; both default to the original's. */
  secondNote?: string
  secondProjectId?: string | null
  /** The chat call's idempotency key — a confirmed split never happens twice. */
  requestId: string
  force?: boolean
}

export type SplitPlan = {
  before: PunchDetail
  first: { status: TimePunch["status"]; startedAt: Date; endedAt: Date; hours: number; note: string }
  second: { status: TimePunch["status"]; startedAt: Date; endedAt: Date; hours: number; note: string; projectId: string | null }
  /** approved line: "keep" (hours shrink to the first piece), "delete", or null when there is none. */
  line: { action: "keep"; hours: number } | { action: "delete" } | null
  lock: PunchLock | null
  replayOf: string | null
  warnings: string[]
}

export async function planSplit(input: PunchSplit): Promise<PunchResult<SplitPlan>> {
  const before = await punchDetail(input.userId, input.punchId)
  if (!before) return { ok: false, status: 404, error: "No punch with that id. Call list_punches for ids." }
  const start = new Date(before.startedAt)
  const end = before.endedAt ? new Date(before.endedAt) : null

  // This card already split the punch: report that, before judging the cut
  // against a punch that is now shorter than when the card was drawn.
  const replay = await db.query.timePunches.findFirst({
    where: and(eq(timePunches.userId, input.userId), eq(timePunches.clientRequestId, input.requestId)),
    columns: { id: true },
  })
  if (replay) {
    const other = await punchDetail(input.userId, replay.id)
    const otherStart = other ? new Date(other.startedAt) : input.at
    const otherEnd = other?.endedAt ? new Date(other.endedAt) : otherStart
    return {
      ok: true,
      data: {
        before,
        first: { status: before.status, startedAt: start, endedAt: end ?? input.at, hours: before.hours, note: before.note },
        second: {
          status: other?.status ?? "stopped",
          startedAt: otherStart,
          endedAt: otherEnd,
          hours: other?.hours ?? 0,
          note: other?.note ?? "",
          projectId: other?.projectId ?? null,
        },
        line: null,
        lock: null,
        replayOf: replay.id,
        warnings: [],
      },
    }
  }

  if (before.status === "running") {
    return { ok: false, status: 409, error: "That punch is still running. Clock it out (edit_punch with a clockOut) before splitting it." }
  }
  const blocker = splitBlocker(start, end, input.at)
  if (blocker || !end) return { ok: false, status: 400, error: blocker ?? "That punch has no end time." }

  let secondProjectId = before.projectId
  if (input.secondProjectId !== undefined) {
    const target = await resolveTarget({ clientId: before.clientId, projectId: input.secondProjectId })
    if ("error" in target) return { ok: false, status: 400, error: target.error }
    secondProjectId = target.projectId
  }

  const warnings: string[] = []
  const hasLine = before.status === "approved" && before.line !== null
  const firstStatus: TimePunch["status"] =
    before.status === "discarded" || input.drop === "before" ? "discarded" : before.status
  const secondStatus: TimePunch["status"] =
    before.status === "discarded" || input.drop === "after" ? "discarded" : "stopped"

  let line: SplitPlan["line"] = null
  let lock: PunchLock | null = null
  if (hasLine) {
    lock = before.lockedBy
    if (lock && !input.force) return { ok: false, status: 409, error: lockError(lock) }
    if (lock) warnings.push(`Invoice ${lock.number} is already ${lock.status}; this changes a billed line.`)
    if (input.drop === "before") {
      line = { action: "delete" }
      warnings.push("The approved line is removed; the part after the split waits in Review.")
    } else {
      line = { action: "keep", hours: punchHours(start, input.at) }
      if (secondStatus === "stopped") warnings.push("The part after the split waits in Review — approve it to bill it.")
    }
  } else if (before.status === "approved") {
    warnings.push("Its timesheet line was deleted earlier, so only the punch is split.")
  }

  return {
    ok: true,
    data: {
      before,
      first: { status: firstStatus, startedAt: start, endedAt: input.at, hours: punchHours(start, input.at), note: before.note },
      second: {
        status: secondStatus,
        startedAt: input.at,
        endedAt: end,
        hours: punchHours(input.at, end),
        note: input.secondNote !== undefined ? input.secondNote.trim() : before.note,
        projectId: secondProjectId,
      },
      line,
      lock,
      replayOf: null,
      warnings,
    },
  }
}

export async function splitPunch(
  input: PunchSplit
): Promise<PunchResult<{ first: PunchDetail; second: PunchDetail; replayed: boolean; warnings: string[] }>> {
  const planned = await planSplit(input)
  if (!planned.ok) return planned
  const plan = planned.data
  const readBoth = async (secondId: string, replayed: boolean) => {
    const [first, second] = await Promise.all([
      punchDetail(input.userId, plan.before.id),
      punchDetail(input.userId, secondId),
    ])
    if (!first || !second) return { ok: false as const, status: 500, error: "Could not read the split punches back." }
    return { ok: true as const, data: { first, second, replayed, warnings: plan.warnings } }
  }
  if (plan.replayOf) return readBoth(plan.replayOf, true)

  const tz = await workspaceTimezone()
  const original = await db.query.timePunches.findFirst({ where: eq(timePunches.id, plan.before.id) })
  if (!original) return { ok: false, status: 404, error: "No punch with that id." }

  let secondId: string
  try {
    secondId = await db.transaction(async (tx) => {
      const dropLine = plan.line?.action === "delete"
      await tx
        .update(timePunches)
        .set({
          endedAt: plan.first.endedAt,
          status: plan.first.status,
          ...(dropLine ? { timeEntryId: null, approvedAt: null, approvedBy: null } : {}),
        })
        .where(eq(timePunches.id, original.id))

      if (plan.line?.action === "keep" && plan.before.line) {
        await tx
          .update(timeEntries)
          .set({ hours: hoursToString(plan.line.hours), endedAt: wallClockIn(plan.first.endedAt, tz) })
          .where(eq(timeEntries.id, plan.before.line.id))
      }
      if (dropLine && plan.before.line) {
        await tx.delete(timeEntries).where(eq(timeEntries.id, plan.before.line.id))
      }

      const [created] = await tx
        .insert(timePunches)
        .values({
          userId: original.userId,
          clientId: original.clientId,
          projectId: plan.second.projectId,
          startedAt: plan.second.startedAt,
          endedAt: plan.second.endedAt,
          status: plan.second.status,
          note: plan.second.note,
          source: original.source,
          deviceId: original.deviceId,
          clientRequestId: input.requestId,
        })
        .returning({ id: timePunches.id })
      return created.id
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await db.query.timePunches.findFirst({
        where: and(eq(timePunches.userId, input.userId), eq(timePunches.clientRequestId, input.requestId)),
        columns: { id: true },
      })
      if (winner) return readBoth(winner.id, true)
    }
    throw error
  }
  return readBoth(secondId, false)
}

/* ---------- drop ---------- */

export type DropPlan = {
  before: PunchDetail
  /** The line that goes with it, for an approved punch. */
  line: PunchLine | null
  lock: PunchLock | null
  already: boolean
}

export async function planDropAny(input: { userId: string; punchId: string; force?: boolean }): Promise<PunchResult<DropPlan>> {
  const before = await punchDetail(input.userId, input.punchId)
  if (!before) return { ok: false, status: 404, error: "No punch with that id. Call list_punches for ids." }
  const line = before.status === "approved" ? before.line : null
  const lock = line ? before.lockedBy : null
  if (lock && !input.force) return { ok: false, status: 409, error: lockError(lock) }
  return { ok: true, data: { before, line, lock, already: before.status === "discarded" } }
}

/**
 * Discard any punch, approved ones included: the punch is kept as discarded
 * ("where did that hour go" still has an answer) and an approved punch's
 * timesheet line is deleted, because that line is the money.
 */
export async function dropAnyPunch(input: {
  userId: string
  punchId: string
  force?: boolean
}): Promise<PunchResult<{ punch: PunchDetail; removedLine: PunchLine | null; already: boolean }>> {
  const planned = await planDropAny(input)
  if (!planned.ok) return planned
  const plan = planned.data
  if (!plan.already) {
    await db.transaction(async (tx) => {
      await tx
        .update(timePunches)
        .set({
          status: "discarded",
          ...(plan.before.status === "running" ? { endedAt: new Date() } : {}),
          ...(plan.before.status === "approved" ? { timeEntryId: null, approvedAt: null, approvedBy: null } : {}),
        })
        .where(eq(timePunches.id, plan.before.id))
      if (plan.line) await tx.delete(timeEntries).where(eq(timeEntries.id, plan.line.id))
    })
  }
  const fresh = await punchDetail(input.userId, plan.before.id)
  if (!fresh) return { ok: false, status: 500, error: "Could not read that punch back." }
  return { ok: true, data: { punch: fresh, removedLine: plan.already ? null : plan.line, already: plan.already } }
}
