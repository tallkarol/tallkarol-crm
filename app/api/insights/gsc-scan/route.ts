import { NextRequest, NextResponse } from "next/server"
import { runGscScan } from "@/lib/insights/gsc-scan"

/**
 * The clock side of the index scan. Same shape as /api/monitors/sweep, because
 * it has the same job: something external calls it on a schedule.
 *
 *   curl -X POST -H "Authorization: Bearer $SWEEP_SECRET" \
 *     "$APP_URL/api/insights/gsc-scan?site=mycustommanufacturer"
 *
 * Cadence is deliberately not decided here. First week of the month is the
 * plan; the endpoint does not care how often it is called, and a second scan on
 * the same day overwrites the first rather than duplicating it.
 */

export const dynamic = "force-dynamic"
// A 63-URL scan is ~90s with the concurrency window; a bigger site scales
// linearly from there. 300 was too tight — the first serial run took seven
// minutes and would have been killed mid-scan.
export const maxDuration = 800

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
  const slug = new URL(request.url).searchParams.get("site")
  if (!slug) {
    return NextResponse.json({ error: "Pass ?site=<slug>" }, { status: 400 })
  }
  try {
    const summary = await runGscScan(slug)
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error("gsc scan failed:", err)
    const detail = err instanceof Error ? err.message : "Scan failed"
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}

export const GET = run
export const POST = run
