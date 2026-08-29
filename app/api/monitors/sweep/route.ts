import { NextRequest, NextResponse } from "next/server"
import { sweepMonitors } from "@/lib/monitors"

/**
 * The clock side of the design: monitors whose window closed with nothing in
 * it. Runs from Railway cron on this service —
 *
 *   curl -H "Authorization: Bearer $SWEEP_SECRET" $APP_URL/api/monitors/sweep
 *
 * It's also the one job nothing else watches, so it records its own heartbeat
 * through the `crm-sweeper` monitor when one exists.
 */

export const dynamic = "force-dynamic"

function authorized(request: NextRequest) {
  const secret = process.env.SWEEP_SECRET || process.env.INGEST_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  return Boolean(token) && token === secret
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await sweepMonitors()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("monitor sweep failed:", err)
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 })
  }
}

export const GET = run
export const POST = run
