import { NextResponse } from "next/server"
import { punchTargets, runningPunch, todayTotals, pendingPunchCount } from "@/lib/punches"
import { workspaceTimezone } from "@/lib/timezone"
import { authenticateTimeRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Everything a watch face needs in one request: what is running, what today
 * adds up to, and the handful of things worth punching next.
 */
export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const [running, today, targets, pending, timezone] = await Promise.all([
    runningPunch(caller.userId),
    todayTotals(caller.userId),
    punchTargets(caller.userId),
    pendingPunchCount(caller.userId),
    workspaceTimezone(),
  ])

  return NextResponse.json(
    {
      running,
      today,
      pendingApproval: pending,
      timezone,
      recent: targets.slice(0, 5),
    },
    { headers: { "cache-control": "no-store" } }
  )
}
