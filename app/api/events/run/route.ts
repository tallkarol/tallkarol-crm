import { NextRequest, NextResponse } from "next/server"
import { authenticateApp } from "@/lib/app-source"
import { findMonitor, recordRun, type RunStatus } from "@/lib/monitors"

/**
 * A scheduled job reporting in.
 *
 *   POST /api/events/run
 *   Authorization: Bearer tk_<app>_<secret>
 *   { "monitor": "artist-house-daily-ingest",
 *     "runId": "…",              // same id for start and finish
 *     "status": "running" | "succeeded" | "partial" | "failed",
 *     "phase": "pipeline", "trigger": "github-actions",
 *     "jobs": { "total": 96, "succeeded": 55, "failed": 41, "skipped": 0 },
 *     "error": { … }, "stats": { … },
 *     "backfill": true }            // record it, don't judge it
 *
 * Failures open or escalate a ticket; a success stands the incident down. What
 * this endpoint cannot see is a run that never starts — that's the sweeper's job.
 */

export const dynamic = "force-dynamic"

const STATUSES: RunStatus[] = ["running", "succeeded", "partial", "failed"]

function toDate(value: unknown) {
  if (typeof value !== "string") return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function int(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApp(request, "runs")
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const slug = String(body.monitor ?? "").trim()
  if (!slug) return NextResponse.json({ error: "A monitor slug is required" }, { status: 400 })

  const status = String(body.status ?? "").trim() as RunStatus
  if (!STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${STATUSES.join(", ")}` },
      { status: 400 }
    )
  }

  const monitor = await findMonitor(slug, auth.source.id)
  if (!monitor) {
    return NextResponse.json(
      { error: `No monitor "${slug}" for this app. Add it with npm run monitor:add.` },
      { status: 404 }
    )
  }

  const jobs = (body.jobs ?? {}) as Record<string, unknown>
  const outcome = await recordRun(
    monitor,
    {
      monitorSlug: slug,
      externalId: String(body.runId ?? "").slice(0, 200),
      status,
      trigger: String(body.trigger ?? ""),
      phase: String(body.phase ?? ""),
      startedAt: toDate(body.startedAt),
      finishedAt: toDate(body.finishedAt),
      jobsTotal: int(jobs.total),
      jobsSucceeded: int(jobs.succeeded),
      jobsFailed: int(jobs.failed),
      jobsSkipped: int(jobs.skipped),
      error: body.error ?? null,
      stats: (body.stats ?? {}) as Record<string, unknown>,
    },
    auth.source,
    { backfill: body.backfill === true }
  )

  return NextResponse.json({
    ok: true,
    runId: outcome.run.id,
    action: outcome.action,
    ticketId: outcome.ticketId,
  })
}
