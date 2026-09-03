import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"
import { widgetPunchlists } from "@/lib/widget-punchlists"

export const dynamic = "force-dynamic"

/**
 * Every open punch list, one summary each — the small tile, and the list the
 * widget's configuration sheet picks from.
 *
 * Answers 200 with an empty `lists` array when nothing is open. The picker
 * calls this before anything is configured, so "no open lists" has to be a
 * normal answer rather than a 404 the sheet would have to special-case.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const now = new Date()
  const data = await widgetPunchlists(now)

  return NextResponse.json(
    { generatedAt: now.toISOString(), ...data },
    { headers: { "cache-control": "no-store" } }
  )
}
