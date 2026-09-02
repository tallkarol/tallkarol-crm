import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"
import { loadLeftOff } from "@/lib/leftoff-data"

export const dynamic = "force-dynamic"

/**
 * Where I left off, for the Mac app and the widgets: every chat's last
 * exchange with its derived state (blocked / parked / waiting / working),
 * the counts for the header line, and the last Chrome tab snapshot.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()
  const payload = await loadLeftOff(new Date())
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } })
}
