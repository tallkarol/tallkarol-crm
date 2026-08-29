import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  appEvents,
  monitorRuns,
  monitors,
  supportTickets,
  type AppSource,
  type Monitor,
  type MonitorRun,
} from "@/db/schema"
import {
  addTicketTags,
  appendMessage,
  attachPayloads,
  createTicket,
  setTicketPriority,
} from "@/lib/tickets"

/**
 * The incident engine.
 *
 * One open ticket per monitor: the first failure opens it, repeats append to it
 * and escalate, and a success posts the recovery and stands the incident down —
 * without closing it, because closing is the moment you've logged the work.
 * A run that never happens is caught by `sweepMonitors`, not by the app, since
 * a job that doesn't start reports nothing at all.
 */

export type RunStatus = "running" | "succeeded" | "partial" | "failed" | "missed"

export type RunInput = {
  monitorSlug: string
  externalId?: string
  status: RunStatus
  trigger?: string
  phase?: string
  startedAt?: Date
  finishedAt?: Date
  jobsTotal?: number
  jobsSucceeded?: number
  jobsFailed?: number
  jobsSkipped?: number
  error?: unknown
  stats?: Record<string, unknown>
}

const MINUTE = 60 * 1000

export async function findMonitor(slug: string, sourceId?: string) {
  return db.query.monitors.findFirst({
    where: sourceId
      ? and(eq(monitors.slug, slug), eq(monitors.sourceId, sourceId))
      : eq(monitors.slug, slug),
    with: { client: { columns: { slug: true, name: true } } },
  })
}

/** Percent of jobs that failed, or 0 when the run didn't report any. */
function failedPercent(run: { jobsTotal: number; jobsFailed: number }) {
  if (!run.jobsTotal) return 0
  return Math.round((run.jobsFailed / run.jobsTotal) * 100)
}

/**
 * A partial run past its monitor's threshold is a failure in everything but
 * name — some jobs fail most days, and a queue that shouts about those stops
 * being read.
 */
function effectiveStatus(monitor: Monitor, run: MonitorRun): RunStatus {
  if (run.status !== "partial") return run.status as RunStatus
  return failedPercent(run) > monitor.partialThreshold ? "failed" : "partial"
}

function errorPayload(run: MonitorRun) {
  const body = JSON.stringify(
    {
      status: run.status,
      phase: run.phase || undefined,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? undefined,
      durationMs: run.durationMs ?? undefined,
      jobs: run.jobsTotal
        ? {
            total: run.jobsTotal,
            succeeded: run.jobsSucceeded,
            failed: run.jobsFailed,
            skipped: run.jobsSkipped,
          }
        : undefined,
      error: run.error ?? undefined,
    },
    null,
    2
  )
  return { label: `Run ${run.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`, lang: "json", body }
}

type MonitorWithClient = Monitor & { client?: { slug: string; name: string } | null }

/**
 * Record a run and let the rules decide what it means. Start and finish for the
 * same `externalId` land on one row, so a long pipeline shows as running until
 * it reports back.
 */
export async function recordRun(
  monitor: MonitorWithClient,
  input: RunInput,
  source?: AppSource | null,
  /**
   * Backfilled history is recorded but never judged. Replaying a month of runs
   * shouldn't open a ticket for a failure you already lived through, or leave
   * the monitor carrying a fail streak that ended weeks ago.
   */
  opts: { backfill?: boolean } = {}
) {
  const now = new Date()
  const startedAt = input.startedAt ?? now
  const finishedAt = input.finishedAt ?? (input.status === "running" ? null : now)
  const values = {
    monitorId: monitor.id,
    externalId: input.externalId ?? "",
    status: input.status,
    trigger: (input.trigger ?? "").slice(0, 60),
    phase: (input.phase ?? "").slice(0, 60),
    startedAt,
    finishedAt,
    durationMs: finishedAt ? finishedAt.getTime() - startedAt.getTime() : null,
    jobsTotal: input.jobsTotal ?? 0,
    jobsSucceeded: input.jobsSucceeded ?? 0,
    jobsFailed: input.jobsFailed ?? 0,
    jobsSkipped: input.jobsSkipped ?? 0,
    error: (input.error ?? null) as MonitorRun["error"],
    stats: (input.stats ?? {}) as MonitorRun["stats"],
  }

  let run: MonitorRun
  if (values.externalId) {
    const [row] = await db
      .insert(monitorRuns)
      .values(values)
      .onConflictDoUpdate({
        target: [monitorRuns.monitorId, monitorRuns.externalId],
        // The index is partial (only rows that carry an external id), so the
        // predicate has to be restated or Postgres can't infer the arbiter.
        targetWhere: sql`${monitorRuns.externalId} <> ''`,
        set: {
          status: values.status,
          phase: values.phase,
          finishedAt: values.finishedAt,
          durationMs: values.durationMs,
          jobsTotal: values.jobsTotal,
          jobsSucceeded: values.jobsSucceeded,
          jobsFailed: values.jobsFailed,
          jobsSkipped: values.jobsSkipped,
          error: values.error,
          stats: values.stats,
        },
      })
      .returning()
    run = row
  } else {
    const [row] = await db.insert(monitorRuns).values(values).returning()
    run = row
  }

  await db
    .update(monitors)
    .set({ lastRunAt: startedAt, updatedAt: now })
    .where(eq(monitors.id, monitor.id))

  if (opts.backfill) {
    if (input.status === "succeeded" || input.status === "partial") {
      await db
        .update(monitors)
        .set({ lastSuccessAt: startedAt, updatedAt: now })
        .where(eq(monitors.id, monitor.id))
    }
    return { run, action: "recorded" as const, ticketId: null }
  }

  const outcome = await applyOutcome({ ...monitor, lastRunAt: startedAt }, run, source)
  return { run, ...outcome }
}

type Outcome = {
  action: "none" | "opened" | "appended" | "escalated" | "recovered" | "recorded"
  ticketId: string | null
}

async function applyOutcome(
  monitor: MonitorWithClient,
  run: MonitorRun,
  source?: AppSource | null
): Promise<Outcome> {
  const status = effectiveStatus(monitor, run)
  const now = new Date()

  if (status === "running") return { action: "none", ticketId: monitor.openTicketId }

  if (status === "succeeded" || status === "partial") {
    await db
      .update(monitors)
      .set({ lastSuccessAt: now, failStreak: 0, updatedAt: now })
      .where(eq(monitors.id, monitor.id))

    if (status === "partial") {
      await logEvent({
        sourceId: source?.id ?? monitor.sourceId,
        clientId: monitor.clientId,
        kind: "run.partial",
        severity: "warn",
        summary: `${monitor.name}: ${run.jobsFailed} of ${run.jobsTotal} jobs failed (under the ${monitor.partialThreshold}% threshold)`,
        meta: { monitor: monitor.slug, runId: run.id },
      })
    }

    if (!monitor.openTicketId) return { action: "none", ticketId: null }

    const failed = monitor.failStreak
    await appendMessage({
      ticketId: monitor.openTicketId,
      role: "system",
      author: "Monitor",
      body:
        `Recovered — the run succeeded after ${failed} failed ${failed === 1 ? "attempt" : "attempts"}.` +
        ` Safe to close once the fix is logged.`,
    })
    await setTicketPriority(monitor.openTicketId, "normal")
    const ticket = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, monitor.openTicketId),
    })
    if (ticket) await addTicketTags(ticket, ["recovered"])
    // The incident is over — a later failure is a new one, not a reopening.
    await db
      .update(monitors)
      .set({ openTicketId: null, updatedAt: now })
      .where(eq(monitors.id, monitor.id))
    return { action: "recovered", ticketId: monitor.openTicketId }
  }

  /* failed or missed */
  const streak = monitor.failStreak + 1
  await db
    .update(monitors)
    .set({ failStreak: streak, updatedAt: now })
    .where(eq(monitors.id, monitor.id))

  const missed = status === "missed"
  const body = missed
    ? streak === 1
      ? `No run arrived inside the expected window (${monitor.scheduleNote || `every ${monitor.expectEveryMinutes} min`}, ${monitor.graceMinutes} min grace). The job never started.`
      : `Still nothing — ${streak} windows have now closed with no run at all.`
    : streak === 1
      ? `Run failed${run.phase ? ` in the ${run.phase} phase` : ""}.` +
        (run.jobsTotal ? ` ${run.jobsFailed} of ${run.jobsTotal} jobs failed.` : "")
      : `Failed again${run.phase ? ` in the ${run.phase} phase` : ""} — ${streak} in a row.` +
        (run.jobsTotal ? ` ${run.jobsFailed} of ${run.jobsTotal} jobs failed.` : "")

  await logEvent({
    sourceId: source?.id ?? monitor.sourceId,
    clientId: monitor.clientId,
    kind: missed ? "run.missed" : "run.failed",
    severity: "error",
    summary: `${monitor.name}: ${missed ? "no run in the expected window" : "run failed"}`,
    meta: { monitor: monitor.slug, runId: run.id, streak },
  })

  if (!monitor.openTicketId) {
    const ticket = await createTicket({
      source: "monitor",
      externalId: `monitor:${monitor.slug}:${run.id}`,
      clientId: monitor.clientId,
      clientSlug: monitor.client?.slug ?? null,
      sourceId: source?.id ?? monitor.sourceId,
      title: missed ? `${monitor.name} didn't run` : `${monitor.name} failed`,
      description: body,
      kind: "incident",
      priority: "high",
      state: "open",
      platform: source?.platform ?? "",
      submittedBy: "Monitor",
      tags: ["cron", monitor.slug],
      raw: {
        env: {
          Monitor: monitor.name,
          Schedule: monitor.scheduleNote || `every ${monitor.expectEveryMinutes} min`,
          "Last success": monitor.lastSuccessAt?.toISOString() ?? "unknown",
        },
      },
    })
    await attachPayloads(ticket.id, [errorPayload(run)])
    await db
      .update(monitors)
      .set({ openTicketId: ticket.id, updatedAt: now })
      .where(eq(monitors.id, monitor.id))
    await db
      .update(monitorRuns)
      .set({ ticketId: ticket.id })
      .where(eq(monitorRuns.id, run.id))
    return { action: "opened", ticketId: ticket.id }
  }

  await appendMessage({
    ticketId: monitor.openTicketId,
    role: "system",
    author: "Monitor",
    body,
  })
  await attachPayloads(monitor.openTicketId, [errorPayload(run)])
  await db
    .update(monitorRuns)
    .set({ ticketId: monitor.openTicketId })
    .where(eq(monitorRuns.id, run.id))

  // A one-off is noise; a streak is a broken pipeline and should outrank the queue.
  if (streak >= 2) {
    await setTicketPriority(monitor.openTicketId, "urgent")
    return { action: "escalated", ticketId: monitor.openTicketId }
  }
  return { action: "appended", ticketId: monitor.openTicketId }
}

/**
 * The half no push can cover: windows that closed with nothing in them. Run on
 * a schedule — one "still nothing" per expected window, not per sweep.
 *
 * Each monitor sets how often it's worth checking (`sweepEveryMinutes`), so the
 * cron can run often without promising every client the same response time.
 */
export async function sweepMonitors(now = new Date()) {
  const all = await db.query.monitors.findMany({
    where: eq(monitors.paused, false),
    with: { client: { columns: { slug: true, name: true } } },
  })

  const due = all.filter((monitor) => {
    if (!monitor.lastSweptAt) return true
    return now.getTime() - monitor.lastSweptAt.getTime() >= monitor.sweepEveryMinutes * MINUTE
  })

  const raised: { monitor: string; action: string; ticketId: string | null }[] = []

  for (const monitor of due) {
    await db
      .update(monitors)
      .set({ lastSweptAt: now })
      .where(eq(monitors.id, monitor.id))

    const since = monitor.lastRunAt ?? monitor.createdAt
    const dueBy = since.getTime() + (monitor.expectEveryMinutes + monitor.graceMinutes) * MINUTE
    if (now.getTime() <= dueBy) continue

    // An in-flight run isn't a missed one.
    const [latest] = await db
      .select()
      .from(monitorRuns)
      .where(eq(monitorRuns.monitorId, monitor.id))
      .orderBy(desc(monitorRuns.startedAt))
      .limit(1)
    if (latest?.status === "running") continue

    // One miss per window: don't re-raise until the next window has closed too.
    if (
      latest?.status === "missed" &&
      now.getTime() - latest.startedAt.getTime() < monitor.expectEveryMinutes * MINUTE
    ) {
      continue
    }

    const outcome = await recordRun(monitor, {
      monitorSlug: monitor.slug,
      status: "missed",
      trigger: "sweeper",
      startedAt: now,
      finishedAt: now,
      error: {
        monitor: monitor.slug,
        expectedWithinMinutes: monitor.expectEveryMinutes + monitor.graceMinutes,
        lastRunAt: monitor.lastRunAt?.toISOString() ?? null,
        lastSuccessAt: monitor.lastSuccessAt?.toISOString() ?? null,
      },
    })
    raised.push({ monitor: monitor.slug, action: outcome.action, ticketId: outcome.ticketId })
  }

  return { monitors: all.length, checked: due.length, raised }
}

export async function logEvent(input: {
  sourceId?: string | null
  clientId?: string | null
  kind: string
  severity?: "info" | "warn" | "error"
  actor?: string
  summary?: string
  count?: number
  meta?: Record<string, unknown>
  occurredAt?: Date
}) {
  await db.insert(appEvents).values({
    sourceId: input.sourceId ?? null,
    clientId: input.clientId ?? null,
    kind: input.kind.slice(0, 60),
    severity: input.severity ?? "info",
    actor: (input.actor ?? "").slice(0, 200),
    summary: (input.summary ?? "").slice(0, 500),
    count: input.count ?? 1,
    meta: input.meta ?? {},
    occurredAt: input.occurredAt ?? new Date(),
  })
}

/** Health of every monitor, for the /uptime screen. */
export async function loadMonitorBoard(limitRuns = 30) {
  const rows = await db.query.monitors.findMany({
    with: { client: { columns: { slug: true, name: true } } },
    orderBy: (m, { asc }) => [asc(m.name)],
  })

  const runs = await db
    .select()
    .from(monitorRuns)
    .where(
      sql`${monitorRuns.id} in (
        select id from (
          select id, row_number() over (partition by monitor_id order by started_at desc) as rn
          from monitor_runs
        ) ranked where rn <= ${limitRuns}
      )`
    )
    .orderBy(desc(monitorRuns.startedAt))

  const byMonitor = new Map<string, MonitorRun[]>()
  for (const run of runs) {
    const list = byMonitor.get(run.monitorId) ?? []
    list.push(run)
    byMonitor.set(run.monitorId, list)
  }

  return rows.map((monitor) => ({
    monitor,
    runs: (byMonitor.get(monitor.id) ?? []).slice().reverse(),
  }))
}

export async function unresolvedIncidentCount() {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(monitors)
    .where(and(eq(monitors.paused, false), sql`${monitors.openTicketId} is not null`))
  return Number(row?.count ?? 0)
}

