import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"
import { widgetAttention, widgetTasks } from "@/lib/widget"

export const dynamic = "force-dynamic"

/**
 * The Next actions widget, in one request: the ranked task list, the collapsed
 * attention flags, and the two counts the small tile shows.
 *
 * Read-only by design — no recurrence reopen, no writes. Repeating tasks are
 * advanced by the cron tick, not by whoever happens to poll first.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const now = new Date()
  const [tasks, attention] = await Promise.all([
    widgetTasks(now),
    widgetAttention(now),
  ])

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      tasks: tasks.tasks,
      flags: attention.flags,
      counts: {
        open: tasks.open,
        deferred: tasks.deferred,
        needsYou: attention.needsYou,
      },
    },
    { headers: { "cache-control": "no-store" } }
  )
}
