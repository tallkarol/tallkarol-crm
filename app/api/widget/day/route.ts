import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import { isDayString, widgetDay } from "@/lib/widget-day"

export const dynamic = "force-dynamic"

/**
 * The Day Ribbon: one local day as a single band, coloured by client, with the
 * untracked holes left visible.
 *
 * `?day=YYYY-MM-DD` for a past day; without it, today in the workspace zone.
 * Read-only — nothing here approves, stops or edits a punch.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const userId = await widgetUserId()
  if (!userId) return NextResponse.json({ error: "No admin user." }, { status: 500 })

  // A malformed day is a bug in the caller, not a reason to silently draw
  // today — the widget would show the wrong band with no way to tell.
  const day = new URL(request.url).searchParams.get("day")?.trim() || null
  if (day && !isDayString(day)) {
    return NextResponse.json({ error: "day must be YYYY-MM-DD." }, { status: 400 })
  }

  return NextResponse.json(await widgetDay(userId, day), {
    headers: { "cache-control": "no-store" },
  })
}
