import { NextResponse } from "next/server"
import { DEFAULT_ITEM_LIMIT, widgetPunchlist } from "@/lib/widget-punchlists"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"

export const dynamic = "force-dynamic"

/**
 * One punch list: its header, the state tally, and the next open items in the
 * order they were filed — each carrying the `taskId` the widget ticks through
 * `POST /api/widget/complete/<taskId>`, and the reporter's own words.
 *
 * `?limit=` trims the items, clamped to 1..40; the medium tile asks for three
 * and the large one for eight. Read-only — nothing here completes anything.
 */
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  if (!authenticateWidget(request)) return unauthorized()

  const raw = new URL(request.url).searchParams.get("limit")
  const parsed = raw == null ? DEFAULT_ITEM_LIMIT : Number.parseInt(raw, 10)
  const limit = Number.isFinite(parsed) ? parsed : DEFAULT_ITEM_LIMIT

  const now = new Date()
  const data = await widgetPunchlist(params.slug, { limit }, now)
  if (!data) {
    return NextResponse.json({ error: "No such punch list." }, { status: 404 })
  }

  return NextResponse.json(
    { generatedAt: now.toISOString(), ...data },
    { headers: { "cache-control": "no-store" } }
  )
}
