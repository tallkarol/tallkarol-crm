import { redirect } from "next/navigation"
import { and, asc, eq, gte, lte } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { TaskBoardView } from "@/components/tasks/TaskBoardView"
import { TaskComposer } from "@/components/tasks/TaskComposer"
import { TaskFilterBar, type BarState } from "@/components/tasks/TaskFilterBar"
import { TaskRows } from "@/components/tasks/TaskRows"
import { TaskWeekView } from "@/components/tasks/TaskWeekView"
import { db } from "@/db"
import { calendarEvents } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import {
  allTasks,
  DEFAULT_VIEW_SLUG,
  ensureDefaultViews,
  listViews,
  reopenDueRecurring,
  taskTargets,
} from "@/lib/tasks"
import { isoDay, taskMatches, type TaskCriteria } from "@/lib/task-view"

export const metadata = { title: "Tasks" }
export const dynamic = "force-dynamic"

function list(value: string | undefined) {
  return (value ?? "").split(",").map((v) => v.trim()).filter(Boolean)
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: {
    view?: string
    q?: string
    client?: string
    project?: string
    state?: string
    group?: string
    sort?: string
    layout?: string
    peek?: string
  }
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  // Repeats reopen on read — one helper, comparing real completion dates.
  await reopenDueRecurring()
  await ensureDefaultViews(user.id)

  const [views, tasks, targets] = await Promise.all([
    listViews(user.id),
    allTasks(),
    taskTargets(),
  ])

  const current =
    views.find((v) => v.slug === searchParams.view) ??
    views.find((v) => v.slug === DEFAULT_VIEW_SLUG) ??
    views[0] ??
    null

  const bar: BarState = {
    view: current?.slug ?? "",
    q: searchParams.q ?? "",
    clients: list(searchParams.client),
    projects: list(searchParams.project),
    state: searchParams.state ?? "",
    group: searchParams.group ?? current?.grouping ?? "none",
    sort: searchParams.sort ?? current?.sortBy ?? "due",
    layout: searchParams.layout ?? current?.layout ?? "list",
  }

  // A lens narrows; a filter narrows again. They compose rather than reset.
  const criteria: TaskCriteria = {
    ...(current?.criteria ?? {}),
    ...(bar.clients.length ? { clients: bar.clients } : {}),
    ...(bar.projects.length ? { projects: bar.projects } : {}),
    ...(bar.state ? { state: bar.state } : {}),
  }

  const today = isoDay(new Date())
  const visible = tasks.filter((task) => taskMatches(task, criteria, bar.q, today))

  // Counts in the menus describe the lens you are in, not the whole table.
  const inLens = tasks.filter((task) =>
    taskMatches(task, current?.criteria ?? {}, "", today)
  )
  const clientOptions = Array.from(
    inLens.reduce((map, task) => {
      if (!task.clientSlug || !task.clientName) return map
      const row = map.get(task.clientSlug) ?? {
        id: task.clientSlug,
        label: task.clientName,
        count: 0,
      }
      row.count += 1
      map.set(task.clientSlug, row)
      return map
    }, new Map<string, { id: string; label: string; count: number }>())
  )
    .map(([, row]) => row)
    .sort((a, b) => a.label.localeCompare(b.label))

  const projectOptions = Array.from(
    inLens.reduce((map, task) => {
      if (!task.projectId || !task.projectName) return map
      const row = map.get(task.projectId) ?? {
        id: task.projectId,
        label: task.projectName,
        count: 0,
      }
      row.count += 1
      map.set(task.projectId, row)
      return map
    }, new Map<string, { id: string; label: string; count: number }>())
  )
    .map(([, row]) => row)
    .sort((a, b) => a.label.localeCompare(b.label))

  const dirty =
    bar.clients.length > 0 ||
    bar.projects.length > 0 ||
    Boolean(bar.state) ||
    bar.group !== (current?.grouping ?? "none") ||
    bar.sort !== (current?.sortBy ?? "due") ||
    bar.layout !== (current?.layout ?? "list")

  const events =
    bar.layout === "week"
      ? await db.query.calendarEvents
          .findMany({
            where: and(
              gte(calendarEvents.startsAt, new Date()),
              lte(
                calendarEvents.startsAt,
                new Date(Date.now() + 8 * 86_400_000)
              ),
              eq(calendarEvents.cancelled, false)
            ),
            orderBy: [asc(calendarEvents.startsAt)],
          })
          .catch(() => [])
      : []

  const peekBase = `/tasks?${new URLSearchParams(
    Object.entries(searchParams).filter(
      ([key, value]) => key !== "peek" && value
    ) as [string, string][]
  ).toString()}`

  return (
    <>
      <PageHeader title="Tasks" />

      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={peekBase} />
      ) : null}

      <TaskFilterBar
        views={views}
        current={current}
        bar={bar}
        clients={clientOptions}
        projects={projectOptions}
        total={tasks.length}
        shown={visible.length}
        dirty={dirty}
      />

      <div className="mt-3">
        <TaskComposer targets={targets} compact />
      </div>

      {bar.layout === "board" ? (
        <TaskBoardView tasks={visible} peekBase={peekBase} />
      ) : bar.layout === "week" ? (
        <TaskWeekView
          tasks={visible.filter((t) => t.status === "open")}
          events={events.map((e) => ({
            id: e.id,
            title: e.title || "Busy",
            startsAt: e.startsAt.toISOString(),
            allDay: e.allDay,
          }))}
          peekBase={peekBase}
        />
      ) : (
        <div className="mt-3">
          <TaskRows
            tasks={visible}
            sortBy={bar.sort}
            grouping={bar.group}
            peekBase={peekBase}
          />
        </div>
      )}
    </>
  )
}
