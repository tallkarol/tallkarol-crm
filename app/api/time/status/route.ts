import { NextResponse } from "next/server"
import { punchTargets, runningPunches, todayTotals, pendingPunchCount } from "@/lib/punches"
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
    runningPunches(caller.userId),
    todayTotals(caller.userId),
    punchTargets(caller.userId),
    pendingPunchCount(caller.userId),
    workspaceTimezone(),
  ])

  return NextResponse.json(
    {
      // Oldest open punch, for clients that show one clock; every open punch
      // for the ones that can show several.
      running: running[0] ?? null,
      runningPunches: running,
      today,
      pendingApproval: pending,
      timezone,
      recent: targets.slice(0, 5),
    },
    { headers: { "cache-control": "no-store" } }
  )
}
