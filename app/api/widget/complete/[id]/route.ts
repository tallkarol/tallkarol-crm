import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { completeTask } from "@/lib/task-complete"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import { widgetTasks } from "@/lib/widget"

export const dynamic = "force-dynamic"

/**
 * Tick one task from the widget. Runs the same `completeTask()` the browser's
 * server action runs, so a repeating task still records the period it
 * satisfied instead of being quietly flipped to done.
 *
 * Answers with the refreshed list so the widget can redraw from this response
 * rather than immediately polling again.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!authenticateWidget(request)) return unauthorized()

  let done = true
  try {
    const body = await request.json()
    if (body && typeof body.done === "boolean") done = body.done
  } catch {
    // No body is the common case: tapping the circle means "done".
  }

  const now = new Date()
  const result = await completeTask(params.id, await widgetUserId(), done, now)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  revalidatePath(ROUTES.tasks)
  revalidatePath(ROUTES.home)

  const refreshed = await widgetTasks(now)

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      completed: { id: params.id, title: result.title, done, period: result.period },
      tasks: refreshed.tasks,
      counts: { open: refreshed.open },
    },
    { headers: { "cache-control": "no-store" } }
  )
}
