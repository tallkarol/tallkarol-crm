import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  clients,
  projects,
  retainers,
  timeEntries,
  timePunches,
} from "@/db/schema"
import type { TimePunch } from "@/db/schema"
import {
  approvalBlocker,
  elapsedLabel,
  occurredOnIn,
  punchFlags,
  punchHours,
  punchMinutes,
  resolveInstant,
  wallClockIn,
  type PunchFlag,
  type PunchSource,
} from "@/lib/punch"
import { workspaceTimezone } from "@/lib/timezone"
import { hoursToString } from "@/lib/timesheet"

/**
 * Every operation on a punch, shared by the API routes and the server actions
 * so the watch and the browser cannot drift apart.
 */

export type PunchResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; running?: PunchView }

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

export async function runningPunch(userId: string): Promise<PunchView | null> {
  const row = (await db.query.timePunches.findFirst({
    where: and(eq(timePunches.userId, userId), eq(timePunches.status, "running")),
    with: withParties,
  })) as PunchRow | undefined
  if (!row) return null
  return toView(row, await workspaceTimezone())
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
  /** Stop whatever is running and start this instead. */
  switchRunning?: boolean
  clientRequestId?: string | null
}

export async function clockIn(
  input: ClockInInput
): Promise<PunchResult<{ punch: PunchView; stopped: PunchView | null }>> {
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
      return { ok: true, data: { punch: toView(existing, tz), stopped: null } }
    }
  }

  const target = await resolveTarget(input)
  if ("error" in target) return { ok: false, status: 400, error: target.error }

  let stopped: PunchView | null = null
  const running = (await db.query.timePunches.findFirst({
    where: and(eq(timePunches.userId, input.userId), eq(timePunches.status, "running")),
    with: withParties,
  })) as PunchRow | undefined

  if (running) {
    if (!input.switchRunning) {
      return {
        ok: false,
        status: 409,
        error: "A punch is already running. Send switch:true to swap to this one.",
        running: toView(running, tz),
      }
    }
    const closed = await stopRunning(running, instant.at)
    if (!closed.ok) return closed
    stopped = closed.data
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
    // Two taps landed at once. The index held; hand back whichever won.
    if (isUniqueViolation(error)) {
      const winner = (await db.query.timePunches.findFirst({
        where: and(
          eq(timePunches.userId, input.userId),
          eq(timePunches.status, "running")
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

  const row = (await db.query.timePunches.findFirst({
    where: input.punchId
      ? and(eq(timePunches.id, input.punchId), eq(timePunches.userId, input.userId))
      : and(eq(timePunches.userId, input.userId), eq(timePunches.status, "running")),
    with: withParties,
  })) as PunchRow | undefined

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

  const clientRetainers = await db.query.retainers.findMany({
    where: eq(retainers.clientId, row.clientId),
  })
  const retainer =
    clientRetainers.find((item) => item.status === "active") ??
    clientRetainers[0] ??
    null

  const occurredOn = input.occurredOn?.trim() || occurredOnIn(start, tz)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return { ok: false, status: 400, error: "That date is not valid." }
  }

  const timeEntryId = await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(timeEntries)
      .values({
        userId: row.userId,
        source: "clock",
        clientId: row.clientId,
        retainerId: retainer?.id ?? null,
        projectId,
        occurredOn,
        startedAt: wallClockIn(start, tz),
        endedAt: wallClockIn(end, tz),
        hours: hoursToString(hours),
        summary,
      })
      .returning({ id: timeEntries.id })

    await tx
      .update(timePunches)
      .set({
        status: "approved",
        note: summary,
        projectId,
        timeEntryId: entry.id,
        approvedAt: new Date(),
        approvedBy: input.approvedBy,
      })
      .where(eq(timePunches.id, row.id))

    return entry.id
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
