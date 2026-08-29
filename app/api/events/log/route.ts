import { NextRequest, NextResponse } from "next/server"
import { authenticateApp } from "@/lib/app-source"
import { logEvent } from "@/lib/monitors"

/**
 * The activity stream — sign-ins, access requests, deliveries. Things you'd
 * want on a timeline six months from now, not debug output.
 *
 *   POST /api/events/log
 *   Authorization: Bearer tk_<app>_<secret>
 *   { "events": [ { "kind": "auth.signed_in", "actor": "ray@…",
 *                   "summary": "…", "severity": "info",
 *                   "count": 1, "meta": { … }, "at": "2026-08-29T…" } ] }
 *
 * Batches are accepted so an app can flush a handful in one call.
 */

export const dynamic = "force-dynamic"

const SEVERITIES = ["info", "warn", "error"] as const
const MAX_BATCH = 50

export async function POST(request: NextRequest) {
  const auth = await authenticateApp(request, "events")
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const list = Array.isArray(body.events) ? body.events : [body]
  const events = list.slice(0, MAX_BATCH) as Record<string, unknown>[]
  if (!events.length) return NextResponse.json({ error: "No events" }, { status: 400 })

  let written = 0
  for (const event of events) {
    const kind = String(event.kind ?? "").trim()
    if (!kind) continue
    const severityRaw = String(event.severity ?? "info")
    const severity = (SEVERITIES as readonly string[]).includes(severityRaw)
      ? (severityRaw as (typeof SEVERITIES)[number])
      : "info"
    const at = typeof event.at === "string" ? new Date(event.at) : new Date()
    await logEvent({
      sourceId: auth.source.id,
      clientId: auth.source.clientId,
      kind,
      severity,
      actor: String(event.actor ?? ""),
      summary: String(event.summary ?? ""),
      count: Number.isFinite(Number(event.count)) ? Math.max(1, Number(event.count)) : 1,
      meta: (event.meta ?? {}) as Record<string, unknown>,
      occurredAt: Number.isNaN(at.getTime()) ? new Date() : at,
    })
    written++
  }

  return NextResponse.json({ ok: true, written })
}
