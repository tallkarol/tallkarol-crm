import { NextResponse } from "next/server"
import { punchTargets } from "@/lib/punches"
import { authenticateTimeRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * What you can punch — every open project, plus a bare retainer row per client
 * for maintenance and one-offs that have no project behind them. Ordered by
 * what you punched most recently, so a watch list needs no scrolling.
 */
export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const targets = await punchTargets(caller.userId)
  return NextResponse.json(
    { targets },
    { headers: { "cache-control": "no-store" } }
  )
}
