import { NextRequest, NextResponse } from "next/server"
import { getSmartsheetConfig, syncSupportTickets } from "@/lib/smartsheet"
import { getTrackerConfig, syncTracker } from "@/lib/smartsheet-tracker"

export const dynamic = "force-dynamic"

/**
 * Smartsheet webhook callback. Two shapes arrive here:
 * 1. Verification: { challenge } — echo it back (header + body) to enable.
 * 2. Events: { webhookId, events } — resync the sheet (small, one call).
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 })
  }

  const challenge =
    (body.challenge as string | undefined) ??
    request.headers.get("smartsheet-hook-challenge") ??
    undefined
  if (challenge) {
    return NextResponse.json(
      { smartsheetHookResponse: challenge },
      { headers: { "Smartsheet-Hook-Response": challenge } }
    )
  }

  // Two sheets call this URL — the support sheet and the marketing tracker.
  // The webhook id says which one, and anything else is ignored.
  const webhookId = String(body.webhookId ?? "")
  const [support, tracker] = await Promise.all([
    getSmartsheetConfig(),
    getTrackerConfig(),
  ])

  if (support.webhookId && webhookId === support.webhookId) {
    const result = await syncSupportTickets()
    return NextResponse.json({ ok: result.ok, sheet: "support", synced: result.synced })
  }

  if (tracker.webhookId && webhookId === tracker.webhookId) {
    const result = await syncTracker()
    return NextResponse.json({ ok: result.ok, sheet: "tracker", synced: result.synced })
  }

  return NextResponse.json({ ok: true, ignored: true })
}
