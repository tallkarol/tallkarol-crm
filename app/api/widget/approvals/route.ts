import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import { widgetApprovals } from "@/lib/widget-approvals"

export const dynamic = "force-dynamic"

/**
 * The "Ready to Approve" queue: every stopped punch, newest first, each one
 * already told whether it can be approved and whether it should be looked at
 * first.
 *
 * Read-only. The tick is `POST /api/widget/clock/punch` with `approve: true`,
 * which already exists and already runs the same gate the Review page uses —
 * there is deliberately no second write path into `time_entries`.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const userId = await widgetUserId()
  if (!userId) return NextResponse.json({ error: "No admin user." }, { status: 500 })

  return NextResponse.json(await widgetApprovals(userId), {
    headers: { "cache-control": "no-store" },
  })
}
