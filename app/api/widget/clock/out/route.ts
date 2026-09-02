import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { clockOut } from "@/lib/punches"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import { widgetClock } from "@/lib/widget-clock"

export const dynamic = "force-dynamic"

/**
 * Stop a punch.
 *
 *   { punchId? }
 *
 * Without an id it stops the one running punch — and answers 409 when several
 * are open, because guessing would stop the wrong clock. 404 when nothing is.
 */
export async function POST(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const userId = await widgetUserId()
  if (!userId) return NextResponse.json({ error: "No admin user." }, { status: 500 })

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    // An empty body is "stop the one that is running".
  }
  const punchId =
    typeof body.punchId === "string" && body.punchId.trim() ? body.punchId.trim() : null

  const result = await clockOut({ userId, punchId })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  revalidatePath(ROUTES.timesheetLive)
  revalidatePath(ROUTES.timesheetReview)
  revalidatePath(ROUTES.home)

  return NextResponse.json(
    { ok: true, stopped: result.data, ...(await widgetClock(userId)) },
    { headers: { "cache-control": "no-store" } }
  )
}
