import { NextResponse } from "next/server"
import { authenticateTimeRequest } from "@/lib/time-api"
import { authenticateWidget } from "@/lib/widget-auth"

/**
 * `/api/leftoff*` answers three callers: the hook scripts on the Mac (a CRM
 * device token), the Mac app's menu bar (the widget token — it leaves notes
 * and dismisses rows), and the CRM itself with a session cookie. Any one is
 * enough; a probe gets one body for every failure.
 */
export async function authenticateLeftOff(request: Request): Promise<boolean> {
  if (authenticateWidget(request)) return true
  return (await authenticateTimeRequest(request)) != null
}

export function unauthorized() {
  return NextResponse.json(
    { error: "Send a device or widget token as `Authorization: Bearer <token>`." },
    { status: 401 }
  )
}
