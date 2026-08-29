import { NextRequest, NextResponse } from "next/server"
import { getSmartsheetConfig, syncSupportTickets } from "@/lib/smartsheet"

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

  // Only react to the webhook we registered.
  const config = await getSmartsheetConfig()
  if (!config.webhookId || String(body.webhookId ?? "") !== config.webhookId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const result = await syncSupportTickets()
  return NextResponse.json({ ok: result.ok, synced: result.synced })
}
