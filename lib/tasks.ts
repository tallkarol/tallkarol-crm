import { and, asc, eq, inArray, ne } from "drizzle-orm"
import { db } from "@/db"
import {
  clients,
  products,
  projects,
  taskCompletions,
  taskItems,
  taskViews,
  tasks,
} from "@/db/schema"
import type { ParseTarget } from "@/lib/task-parse"
import {
  WAITING_ALERT_DAYS,
  daysBetween,
  isoDay,
  periodKey,
  periodLabel,
  taskMatches,
  type HubTask,
  type TaskCriteria,
  type ViewRow,
} from "@/lib/task-view"

/**
 * Everything the task hub reads from Postgres. The shaping — sorting, banding,
 * grouping, period maths — lives in `lib/task-view.ts` so the browser can run
 * it too.
 */

export {
  PRIORITY_LABEL,
  STAGE_LABEL,
  WAITING_ALERT_DAYS,
  periodKey,
  periodLabel,
} from "@/lib/task-view"
export type { HubTask, TaskCriteria, ViewRow } from "@/lib/task-view"

/* ------------------------------------------------------------------ */
/* recurrence                                                           */
/* ------------------------------------------------------------------ */

/**
 * Reopen repeating tasks whose completion belongs to a past period.
 *
 * The old logic compared `updated_at` to the first of the month for every
 * cadence, so a weekly task ticked off on the 5th stayed done until the 1st.
 * This compares real completion dates against the period each cadence means.
 */
export async function reopenDueRecurring(now = new Date()) {
  const done = await db.query.tasks.findMany({
    where: and(ne(tasks.cadence, "none"), eq(tasks.status, "done")),
    columns: { id: true, cadence: true, completedAt: true, updatedAt: true },
  })
  if (done.length === 0) return 0

  const stale = done.filter((row) => {
    const at = row.completedAt ?? row.updatedAt
    return periodKey(row.cadence, at) !== periodKey(row.cadence, now)
  })
  if (stale.length === 0) return 0

  await db
    .update(tasks)
    .set({
      status: "open",
      completedAt: null,
      boardStage: "queue",
      updatedAt: new Date(),
    })
    .where(
      inArray(
        tasks.id,
        stale.map((row) => row.id)
      )
    )
  return stale.length
}

/* ------------------------------------------------------------------ */
/* views                                                                */
/* ------------------------------------------------------------------ */

const BUILT_IN: Omit<ViewRow, "id">[] = [
  {
    name: "Needs me today",
    slug: "needs-me",
    criteria: { state: "open", needsMe: true },
    layout: "list",
    grouping: "none",
    sortBy: "due",
    position: 0,
    builtIn: true,
  },
  {
    name: "Overdue",
    slug: "overdue",
    criteria: { state: "open", due: "overdue" },
    layout: "list",
    grouping: "none",
    sortBy: "due",
    position: 1,
    builtIn: true,
  },
  {
    name: "Waiting on client",
    slug: "waiting",
    criteria: { state: "waiting" },
    layout: "list",
    grouping: "none",
    sortBy: "updated",
    position: 2,
    builtIn: true,
  },
  {
    name: "Delivery board",
    slug: "board",
    criteria: { state: "open" },
    layout: "board",
    grouping: "none",
    sortBy: "priority",
    position: 3,
    builtIn: true,
  },
  {
    name: "Repeating",
    slug: "repeating",
    criteria: { cadence: "repeating" },
    layout: "list",
    grouping: "none",
    sortBy: "client",
    position: 4,
    builtIn: true,
  },
  {
    name: "All tasks",
    slug: "all",
    criteria: { state: "open", includeSnoozed: true },
    layout: "list",
    grouping: "due",
    sortBy: "due",
    position: 5,
    builtIn: true,
  },
  {
    name: "Archive",
    slug: "archive",
    criteria: { state: "done" },
    layout: "list",
    grouping: "none",
    sortBy: "completed",
    position: 6,
    builtIn: true,
  },
]

export const DEFAULT_VIEW_SLUG = "needs-me"

/**
 * Seeds the default lenses the first time someone opens the hub, plus one per
 * client that is actually live. Only missing slugs are added, so a rename or a
 * reorder survives.
 */
export async function ensureDefaultViews(userId: string) {
  const existing = await db.query.taskViews.findMany({
    where: eq(taskViews.userId, userId),
    columns: { slug: true },
  })
  const have = new Set(existing.map((row) => row.slug))

  const wanted: Omit<ViewRow, "id">[] = [...BUILT_IN]

  const live = await db.query.clients.findMany({
    with: { retainers: true, projects: true, products: true },
    orderBy: [asc(clients.name)],
  })
  let position = BUILT_IN.length
  for (const client of live) {
    const active =
      client.retainers.some((r) => r.status === "active") ||
      client.projects.some((p) => p.status !== "complete") ||
      client.products.length > 0
    if (!active) continue
    wanted.push({
      name: client.name,
      slug: `client-${client.slug}`,
      criteria: { clients: [client.slug], state: "open" },
      layout: "list",
      grouping: "none",
      sortBy: "due",
      position: position++,
      builtIn: true,
    })
  }

  const missing = wanted.filter((view) => !have.has(view.slug))
  if (missing.length === 0) return
  await db
    .insert(taskViews)
    .values(missing.map((view) => ({ ...view, userId })))
    .onConflictDoNothing()
}

export async function listViews(userId: string): Promise<ViewRow[]> {
  const rows = await db.query.taskViews.findMany({
    where: eq(taskViews.userId, userId),
    orderBy: [asc(taskViews.position), asc(taskViews.name)],
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    criteria: (row.criteria ?? {}) as TaskCriteria,
    layout: row.layout,
    grouping: row.grouping,
    sortBy: row.sortBy,
    position: row.position,
    builtIn: row.builtIn,
  }))
}

/* ------------------------------------------------------------------ */
/* the hub query                                                        */
/* ------------------------------------------------------------------ */

/** Every task, shaped for the hub. Filtering happens in memory — at this size
 *  one round trip beats a query per filter combination. */
export async function allTasks(now = new Date()): Promise<HubTask[]> {
  const today = isoDay(now)
  const rows = await db.query.tasks.findMany({
    orderBy: [asc(tasks.createdAt)],
    with: {
      client: { columns: { id: true, name: true, slug: true } },
      project: { columns: { id: true, name: true, slug: true } },
      product: { columns: { id: true, name: true, slug: true } },
      retainer: { columns: { name: true } },
      deliverable: { columns: { label: true } },
      items: { columns: { id: true, done: true } },
    },
  })

  return rows.map((row) => {
    const items = row.items ?? []
    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      status: row.status,
      stage: row.boardStage,
      cadence: row.cadence,
      priority: row.priority,
      dueOn: row.dueOn,
      snoozedUntil: row.snoozedUntil,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      source: row.source,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
      clientSlug: row.client?.slug ?? null,
      projectId: row.projectId,
      projectName: row.project?.name ?? null,
      projectSlug: row.project?.slug ?? null,
      productId: row.productId,
      productName: row.product?.name ?? null,
      productSlug: row.product?.slug ?? null,
      retainerName: row.retainer?.name ?? null,
      deliverableLabel: row.deliverable?.label ?? null,
      items: { total: items.length, done: items.filter((i) => i.done).length },
      waitingDays:
        row.status === "open" && row.boardStage === "waiting"
          ? daysBetween(isoDay(row.updatedAt), today)
          : null,
      overdueDays:
        row.status === "open" && row.dueOn && row.dueOn < today
          ? daysBetween(row.dueOn, today)
          : null,
      periodNote: row.cadence === "none" ? null : periodLabel(row.cadence, now),
    }
  })
}

export async function listTasks(
  criteria: TaskCriteria,
  options: { q?: string; now?: Date } = {}
): Promise<HubTask[]> {
  const now = options.now ?? new Date()
  const today = isoDay(now)
  const rows = await allTasks(now)
  return rows.filter((task) => taskMatches(task, criteria, options.q ?? "", today))
}

/** Open tasks filed against one project or client — the entity-page lists. */
export async function tasksFor(
  scope: {
    projectId?: string
    clientId?: string
    retainerId?: string
    productId?: string
  },
  now = new Date()
): Promise<HubTask[]> {
  const rows = await allTasks(now)
  return rows.filter((task) => {
    if (scope.productId) return task.productId === scope.productId
    if (scope.projectId) return task.projectId === scope.projectId
    if (scope.clientId) return task.clientId === scope.clientId
    return false
  })
}

/* ------------------------------------------------------------------ */
/* composer targets + dashboard                                         */
/* ------------------------------------------------------------------ */

/** Everything `@` can resolve to: every client, and every open project. */
export async function taskTargets(): Promise<ParseTarget[]> {
  const [clientRows, projectRows, productRows] = await Promise.all([
    db.query.clients.findMany({ orderBy: [asc(clients.name)] }),
    db
      .select({ id: projects.id, name: projects.name, clientId: projects.clientId })
      .from(projects)
      .where(ne(projects.status, "complete"))
      .orderBy(asc(projects.name)),
    db
      .select({
        id: products.id,
        name: products.name,
        clientId: products.clientId,
      })
      .from(products)
      .orderBy(asc(products.sort), asc(products.name)),
  ])

  const byId = new Map(clientRows.map((row) => [row.id, row]))
  const out: ParseTarget[] = clientRows.map((row) => ({
    clientId: row.id,
    clientName: row.name,
    clientSlug: row.slug,
    projectId: null,
    projectName: null,
    productId: null,
    productName: null,
  }))
  for (const project of projectRows) {
    const client = byId.get(project.clientId)
    if (!client) continue
    out.push({
      clientId: client.id,
      clientName: client.name,
      clientSlug: client.slug,
      projectId: project.id,
      projectName: project.name,
      productId: null,
      productName: null,
    })
  }
  for (const product of productRows) {
    const client = product.clientId ? byId.get(product.clientId) : null
    if (product.clientId && !client) continue
    out.push({
      clientId: client?.id ?? null,
      clientName: client?.name ?? null,
      clientSlug: client?.slug ?? null,
      projectId: null,
      projectName: null,
      productId: product.id,
      productName: product.name,
    })
  }
  return out
}

/** Open tasks parked in "waiting" long enough to have been forgotten. */
export async function waitingTooLong(now = new Date()) {
  const rows = await db.query.tasks.findMany({
    where: and(eq(tasks.status, "open"), eq(tasks.boardStage, "waiting")),
    with: { client: { columns: { name: true, slug: true } } },
  })
  const today = isoDay(now)
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      clientName: row.client?.name ?? null,
      clientSlug: row.client?.slug ?? null,
      days: daysBetween(isoDay(row.updatedAt), today),
    }))
    .filter((row) => row.days >= WAITING_ALERT_DAYS)
    .sort((a, b) => b.days - a.days)
}

/** Completion history for a repeating task — the streak. */
export async function completionHistory(taskId: string, limit = 12) {
  return db.query.taskCompletions.findMany({
    where: eq(taskCompletions.taskId, taskId),
    orderBy: (t, { desc }) => [desc(t.completedOn)],
    limit,
  })
}

export async function taskChecklist(taskId: string) {
  return db.query.taskItems.findMany({
    where: eq(taskItems.taskId, taskId),
    orderBy: [asc(taskItems.sort), asc(taskItems.createdAt)],
  })
}
