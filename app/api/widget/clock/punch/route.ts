import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { approvePunch, updatePunch } from "@/lib/punches"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import { widgetClock } from "@/lib/widget-clock"

export const dynamic = "force-dynamic"

/**
 * The details sheet after a clock-out.
 *
 *   { punchId, note?, approve? }
 *
 * Saves the summary on a stopped punch, and with `approve` walks it through the
 * same gate the Review page uses — so a punch approved from the desktop lands on
 * the timesheet exactly as one approved in the browser would. Without `approve`
 * the punch stays in the review queue with its note filled in.
 */
export async function POST(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const userId = await widgetUserId()
  if (!userId) return NextResponse.json({ error: "No admin user." }, { status: 500 })

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }

  const punchId = typeof body.punchId === "string" ? body.punchId.trim() : ""
  if (!punchId) return NextResponse.json({ error: "punchId is required." }, { status: 400 })
  const note = typeof body.note === "string" ? body.note : undefined

  const saved = await updatePunch({ userId, punchId, note })
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: saved.status })
  }

  let punch = saved.data
  if (body.approve === true) {
    const approved = await approvePunch({ punchId, approvedBy: userId, summary: note })
    if (!approved.ok) {
      // The note is saved either way; only the approval is refused.
      return NextResponse.json(
        { error: approved.error, punch },
        { status: approved.status }
      )
    }
    punch = approved.data.punch
  }

  revalidatePath(ROUTES.timesheetLive)
  revalidatePath(ROUTES.timesheetReview)
  revalidatePath(ROUTES.timesheet)
  revalidatePath(ROUTES.home)

  return NextResponse.json(
    { ok: true, punch, ...(await widgetClock(userId)) },
    { headers: { "cache-control": "no-store" } }
  )
}
