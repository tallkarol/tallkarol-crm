import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { clockIn } from "@/lib/punches"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import { widgetClock } from "@/lib/widget-clock"

export const dynamic = "force-dynamic"

/**
 * Start a punch from the widget.
 *
 *   { clientId?, projectId?, switch?, clientRequestId? }
 *
 * Runs the same `clockIn` the watch and the browser do, so the one-running-punch
 * constraint and the retry guard are enforced in exactly one place. Answers 409
 * with the running punch when something is already open, unless `switch` is set
 * — a widget tap should never silently abandon a punch you forgot about.
 */
export async function POST(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const userId = await widgetUserId()
  if (!userId) return NextResponse.json({ error: "No admin user." }, { status: 500 })

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    // An empty body is a valid "clock into my configured target" with none set.
  }

  const asString = (key: string) =>
    typeof body[key] === "string" && (body[key] as string).trim()
      ? (body[key] as string).trim()
      : null

  const result = await clockIn({
    userId,
    clientId: asString("clientId"),
    projectId: asString("projectId"),
    source: "api",
    switchRunning: body.switch === true,
    clientRequestId: asString("clientRequestId"),
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, running: result.running ?? null },
      { status: result.status }
    )
  }

  revalidatePath(ROUTES.timesheetLive)
  revalidatePath(ROUTES.home)

  return NextResponse.json(
    { ok: true, punch: result.data.punch, stopped: result.data.stopped, ...(await widgetClock(userId)) },
    { headers: { "cache-control": "no-store" } }
  )
}
