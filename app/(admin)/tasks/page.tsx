import { redirect } from "next/navigation"
import { SWEEP_MS, oncePer } from "@/lib/once-per"
import { and, asc, eq, gte, lte } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { TaskComposer } from "@/components/tasks/TaskComposer"
import { TaskHubView } from "@/components/tasks/TaskHubView"
import { db } from "@/db"
import { calendarEvents } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import {
  allTasks,
  clientsFromTargets,
  DEFAULT_VIEW_SLUG,
  ensureDefaultViews,
  listViews,
  reopenDueRecurring,
  taskTargets,
} from "@/lib/tasks"
import { isoDay } from "@/lib/task-view"

export const metadata = { title: "Tasks" }
export const dynamic = "force-dynamic"

/**
 * Loads every task once. The lens, filters, search, grouping, sort and
 * layout are applied in TaskHubView from the URL, so changing them never
 * comes back here — only a peek, a write (router.refresh) or a hard load does.
 */
export default async function TasksPage({
  searchParams,
}: {
  /** Only `peek` is read here; the rest ride along into the card's close link. */
  searchParams: Record<string, string | undefined>
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  // Repeats reopen on read — one helper, comparing real completion dates.
  // It has to finish before the tasks are read; between sweeps the throttle
  // makes it free.
  await oncePer("reopen", SWEEP_MS, () => reopenDueRecurring())

  // Everything else in one round trip. Seeding the default views used to run
  // ahead of these reads as two round trips of its own; it now runs beside
  // them, and the views are listed again only when it added one.
  const [seeded, firstViews, tasks, targets, events] = await Promise.all([
    ensureDefaultViews(user.id),
    listViews(user.id),
    allTasks(),
    taskTargets(),
    // Read whatever the layout, so switching to Week is instant too. One
    // small indexed query: the next eight days of calendar.
    db.query.calendarEvents
      .findMany({
        where: and(
          gte(calendarEvents.startsAt, new Date()),
          lte(calendarEvents.startsAt, new Date(Date.now() + 8 * 86_400_000)),
          eq(calendarEvents.cancelled, false)
        ),
        orderBy: [asc(calendarEvents.startsAt)],
      })
      .catch(() => []),
  ])
  const views = seeded > 0 ? await listViews(user.id) : firstViews

  // The card closes back to the filtered list it was opened from.
  const kept = new URLSearchParams(
    Object.entries(searchParams).filter(([key, value]) => key !== "peek" && value) as [string, string][]
  ).toString()
  const closeHref = kept ? `/tasks?${kept}` : "/tasks"

  return (
    <>
      <PageHeader title="Tasks" />

      {searchParams.peek ? <PeekRouter peek={searchParams.peek} closeHref={closeHref} /> : null}

      <TaskHubView
        tasks={tasks}
        views={views}
        defaultView={DEFAULT_VIEW_SLUG}
        today={isoDay(new Date())}
        events={events.map((e) => ({
          id: e.id,
          title: e.title || "Busy",
          startsAt: e.startsAt.toISOString(),
          allDay: e.allDay,
        }))}
        clients={clientsFromTargets(targets)}
        composer={<TaskComposer targets={targets} compact />}
      />
    </>
  )
}
