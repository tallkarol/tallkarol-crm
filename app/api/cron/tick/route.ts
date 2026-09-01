import { NextRequest, NextResponse } from "next/server"
import { tick } from "@/lib/tick"

/**
 * Scheduled maintenance, for any external scheduler. Same secret as the
 * monitor sweep it replaces:
 *
 *   curl -H "Authorization: Bearer $SWEEP_SECRET" $APP_URL/api/cron/tick
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
    const result = await tick()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("cron tick failed:", err)
    return NextResponse.json({ error: "Tick failed" }, { status: 500 })
  }
}

export const GET = run
export const POST = run
