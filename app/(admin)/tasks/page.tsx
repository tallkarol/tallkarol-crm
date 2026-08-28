import { and, asc, eq, gte, lt, lte, ne } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { TasksHub, type HubEvent, type HubTask } from "@/components/tasks/TasksHub"
import { db } from "@/db"
import { calendarEvents, tasks } from "@/db/schema"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Tasks" }
export const dynamic = "force-dynamic"

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { peek?: string }
}) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Repeating tasks checked off in a previous month re-open lazily on read —
  // no cron needed.
  await db
    .update(tasks)
    .set({ status: "open", updatedAt: new Date() })
    .where(
      and(ne(tasks.cadence, "none"), eq(tasks.status, "done"), lt(tasks.updatedAt, monthStart))
    )

  const weekEnd = new Date(todayStart.getTime() + 8 * 86_400_000)
  const [rows, clients, events] = await Promise.all([
    db.query.tasks.findMany({
      orderBy: (t) => [asc(t.createdAt)],
      with: { client: true },
    }),
    db.query.clients.findMany({ orderBy: (c, { asc: a }) => [a(c.name)] }),
    db.query.calendarEvents
      .findMany({
        where: and(
          gte(calendarEvents.startsAt, todayStart),
          lte(calendarEvents.startsAt, weekEnd),
          eq(calendarEvents.cancelled, false)
        ),
        orderBy: [asc(calendarEvents.startsAt)],
      })
      .catch(() => []),
  ])

  const hubTasks: HubTask[] = rows
    .filter((t) => t.status === "open" || t.updatedAt >= todayStart)
    .map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      cadence: t.cadence,
      status: t.status,
      dueOn: t.dueOn,
      clientId: t.clientId,
      clientSlug: t.client?.slug ?? null,
      clientName: t.client?.name ?? null,
      doneToday: t.status === "done" && t.updatedAt >= todayStart,
    }))

  const hubEvents: HubEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title || "Busy",
    startsAt: e.startsAt.toISOString(),
    allDay: e.allDay,
  }))

  return (
    <>
      <PageHeader title="Tasks" />
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.tasks} />
      ) : null}
      <TasksHub
        tasks={hubTasks}
        events={hubEvents}
        clients={clients.map((c) => ({ id: c.id, slug: c.slug, name: c.name }))}
      />
    </>
  )
}
