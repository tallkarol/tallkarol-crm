"use client"

import { useMemo, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { TaskBoardView } from "@/components/tasks/TaskBoardView"
import type { TaskClientOption } from "@/components/tasks/TaskClientMenu"
import { TaskFilterBar, type BarOption, type BarState } from "@/components/tasks/TaskFilterBar"
import { TaskRows } from "@/components/tasks/TaskRows"
import { TaskWeekView, type WeekEvent } from "@/components/tasks/TaskWeekView"
import { taskMatches, type HubTask, type TaskCriteria, type ViewRow } from "@/lib/task-view"

function list(value: string | null) {
  return (value ?? "").split(",").map((v) => v.trim()).filter(Boolean)
}

/** Menu rows for one facet of the tasks in the lens, with counts, A–Z. */
function options(tasks: HubTask[], pick: (task: HubTask) => [string, string] | null): BarOption[] {
  const map = new Map<string, BarOption>()
  for (const task of tasks) {
    const hit = pick(task)
    if (!hit) continue
    const [id, label] = hit
    const row = map.get(id) ?? { id, label, count: 0 }
    row.count += 1
    map.set(id, row)
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * The task hub below the header: filter bar, composer, and the list/board/week.
 *
 * The page loads every task once; the lens, filters, search, grouping, sort
 * and layout are applied HERE, from the URL, so a filter click is a render
 * and not a server round trip. The bar writes the URL with history.pushState
 * (see TaskFilterBar), which Next syncs into useSearchParams — a view is still
 * a link, back and forward still walk the filters, and a hard load of any
 * filtered URL renders the same list on the server.
 */
export function TaskHubView({
  tasks,
  views,
  defaultView,
  today,
  events,
  clients,
  composer,
}: {
  tasks: HubTask[]
  views: ViewRow[]
  defaultView: string
  /** The server's day, so the server render and hydration agree on "overdue". */
  today: string
  events: WeekEvent[]
  clients: TaskClientOption[]
  composer: ReactNode
}) {
  const params = useSearchParams()

  const derived = useMemo(() => {
    const viewSlug = params.get("view")
    const current =
      views.find((v) => v.slug === viewSlug) ??
      views.find((v) => v.slug === defaultView) ??
      views[0] ??
      null

    const bar: BarState = {
      view: current?.slug ?? "",
      q: params.get("q") ?? "",
      clients: list(params.get("client")),
      projects: list(params.get("project")),
      state: params.get("state") ?? "",
      group: params.get("group") ?? current?.grouping ?? "none",
      sort: params.get("sort") ?? current?.sortBy ?? "due",
      layout: params.get("layout") ?? current?.layout ?? "list",
    }

    // A lens narrows; a filter narrows again. They compose rather than reset.
    const criteria: TaskCriteria = {
      ...(current?.criteria ?? {}),
      ...(bar.clients.length ? { clients: bar.clients } : {}),
      ...(bar.projects.length ? { projects: bar.projects } : {}),
      ...(bar.state ? { state: bar.state } : {}),
    }
    const visible = tasks.filter((task) => taskMatches(task, criteria, bar.q, today))

    // Counts in the menus describe the lens you are in, not the whole table.
    const inLens = tasks.filter((task) => taskMatches(task, current?.criteria ?? {}, "", today))
    const clientOptions = options(inLens, (t) => (t.clientSlug && t.clientName ? [t.clientSlug, t.clientName] : null))
    const projectOptions = options(inLens, (t) => (t.projectId && t.projectName ? [t.projectId, t.projectName] : null))

    const dirty =
      bar.clients.length > 0 ||
      bar.projects.length > 0 ||
      Boolean(bar.state) ||
      bar.group !== (current?.grouping ?? "none") ||
      bar.sort !== (current?.sortBy ?? "due") ||
      bar.layout !== (current?.layout ?? "list")

    const query = new URLSearchParams(params)
    query.delete("peek")
    const kept = query.toString()
    const peekBase = kept ? `/tasks?${kept}` : "/tasks"

    return { current, bar, visible, open: visible.filter((t) => t.status === "open"), clientOptions, projectOptions, dirty, peekBase }
  }, [params, tasks, views, defaultView, today])

  const { current, bar, visible, open, clientOptions, projectOptions, dirty, peekBase } = derived

  return (
    <>
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

      <div className="mt-3">{composer}</div>

      {bar.layout === "board" ? (
        <TaskBoardView tasks={visible} peekBase={peekBase} clients={clients} />
      ) : bar.layout === "week" ? (
        <TaskWeekView tasks={open} events={events} peekBase={peekBase} clients={clients} />
      ) : (
        <div className="mt-3">
          <TaskRows tasks={visible} sortBy={bar.sort} grouping={bar.group} peekBase={peekBase} clients={clients} />
        </div>
      )}
    </>
  )
}
