import { NextResponse } from "next/server"
import { clockOut } from "@/lib/punches"
import { approvalBlocker } from "@/lib/punch"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Stop the running punch.
 *
 * { punchId?, note?, at? }
 *
 * Returns the punch plus what it would bill and whether anything stands in the
 * way of approving it — so a watch can say "needs a summary" without a second
 * round trip.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const result = await clockOut({
    userId: caller.userId,
    punchId: readString(body, "punchId"),
    note: readString(body, "note") ?? "",
    at: body.at,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const punch = result.data
  return NextResponse.json({
    punch,
    rawMinutes: punch.minutes,
    wouldBill: punch.hours,
    needs: approvalBlocker({
      clientId: punch.clientId,
      projectId: punch.projectId,
      summary: punch.note,
      hours: punch.hours,
    }),
  })
}
