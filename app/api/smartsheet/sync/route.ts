import { NextRequest, NextResponse } from "next/server"
import { runScheduledSync } from "@/lib/smartsheet-run"
import { SCHEDULE_NOTE } from "@/lib/smartsheet-schedule"

/**
 * The clock side of the Smartsheet integration: pull both sheets on a
 * schedule, so nothing sits unseen between webhook events. Runs from Railway
 * cron —
 *
 *   curl -H "Authorization: Bearer $SWEEP_SECRET" $APP_URL/api/smartsheet/sync
 *
 * Railway evaluates cron in UTC, so this is scheduled hourly and decides for
 * itself whether the hour it woke up in is a slot — 8am, noon and 4pm on
 * weekdays, noon at weekends, Colorado time. Any other hour is a no-op.
 * Add ?force=1 to sync regardless.
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
    const force = request.nextUrl.searchParams.get("force") === "1"
    const result = await runScheduledSync({ force })
    // A sync that ran and failed is a real failure — say so in the status code
    // so whatever calls this can tell the difference from a quiet no-op.
    return NextResponse.json(
      { ...result, schedule: SCHEDULE_NOTE },
      { status: result.ok ? 200 : 500 }
    )
  } catch (err) {
    console.error("smartsheet sync failed:", err)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}

export const GET = run
export const POST = run
