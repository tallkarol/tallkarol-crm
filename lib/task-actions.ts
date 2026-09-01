"use server"

import { and, asc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import {
  clients,
  deliverables,
  products,
  projects,
  taskItems,
  taskViews,
  tasks,
} from "@/db/schema"
import type { Cadence } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { completeTask } from "@/lib/task-complete"

type Ok<T = undefined> = T extends undefined
  ? { ok: true }
  : { ok: true; data: T }
type Result<T = undefined> = Ok<T> | { ok: false; error: string }

const CADENCES: Cadence[] = ["none", "weekly", "monthly", "quarterly"]
const STAGES = ["queue", "doing", "waiting"] as const

function touch() {
  revalidatePath(ROUTES.tasks)
  revalidatePath(ROUTES.home)
  revalidatePath(ROUTES.projects)
  revalidatePath(ROUTES.retainers)
  revalidatePath(ROUTES.clients)
  revalidatePath(ROUTES.products)
}

function isDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * A project or deliverable fills in its client. A product may stand alone
 * (Tall Karol products have no client). The same rule the composer follows.
 */
async function resolveTarget(input: {
  clientId?: string | null
  projectId?: string | null
  productId?: string | null
  deliverableId?: string | null
}): Promise<
  | {
      clientId: string | null
      projectId: string | null
      productId: string | null
      retainerId: string | null
      deliverableId: string | null
    }
  | { error: string }
> {
  const projectId = input.projectId || null
  const productId = input.productId || null
  const deliverableId = input.deliverableId || null

  if (deliverableId) {
    const deliverable = await db.query.deliverables.findFirst({
      where: eq(deliverables.id, deliverableId),
      with: { project: true },
    })
    if (!deliverable) return { error: "That deliverable does not exist." }
    return {
      clientId: deliverable.project.clientId,
      projectId: deliverable.projectId,
      productId: null,
      retainerId: deliverable.project.retainerId,
      deliverableId,
    }
  }

  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    })
    if (!project) return { error: "That project does not exist." }
    return {
      clientId: project.clientId,
      projectId: project.id,
      productId: null,
      retainerId: project.retainerId,
      deliverableId: null,
    }
  }

  if (productId) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
    })
    if (!product) return { error: "That product does not exist." }
    return {
      clientId: product.clientId,
      projectId: null,
      productId: product.id,
      retainerId: null,
      deliverableId: null,
    }
  }

  if (input.clientId) {
    const client = await db.query.clients.findFirst({
      where: eq(clients.id, input.clientId),
      with: { retainers: true },
    })
    if (!client) return { error: "That client does not exist." }
    const retainer =
      client.retainers.find((r) => r.status === "active") ?? null
    return {
      clientId: client.id,
      projectId: null,
      productId: null,
      retainerId: retainer?.id ?? null,
      deliverableId: null,
    }
  }

  return {
    clientId: null,
    projectId: null,
    productId: null,
    retainerId: null,
    deliverableId: null,
  }
}

export type CreateTaskInput = {
  title: string
  clientId?: string | null
  projectId?: string | null
  productId?: string | null
  deliverableId?: string | null
  dueOn?: string | null
  snoozedUntil?: string | null
  cadence?: Cadence
  priority?: number
  notes?: string
  source?: string
  refKind?: string | null
  refId?: string | null
}

export async function createTask(
  input: CreateTaskInput
): Promise<Result<{ id: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const title = input.title.trim().slice(0, 300)
  if (!title) return { ok: false, error: "A task needs a title." }

  const target = await resolveTarget(input)
  if ("error" in target) return { ok: false, error: target.error }

  if (input.dueOn && !isDay(input.dueOn)) {
    return { ok: false, error: "That due date is not valid." }
  }
  if (input.snoozedUntil && !isDay(input.snoozedUntil)) {
    return { ok: false, error: "That snooze date is not valid." }
  }
  const cadence = input.cadence && CADENCES.includes(input.cadence) ? input.cadence : "none"
  const priority = [1, 2, 3].includes(input.priority ?? 2) ? (input.priority ?? 2) : 2

  const [created] = await db
    .insert(tasks)
    .values({
      title,
      userId: user.id,
      clientId: target.clientId,
      projectId: target.projectId,
      productId: target.productId,
      retainerId: target.retainerId,
      deliverableId: target.deliverableId,
      dueOn: input.dueOn || null,
      snoozedUntil: input.snoozedUntil || null,
      cadence,
      priority,
      notes: (input.notes ?? "").slice(0, 4000),
      source: input.source ?? "manual",
      refKind: input.refKind ?? null,
      refId: input.refId ?? null,
    })
    .returning({ id: tasks.id })

  touch()
  return { ok: true, data: { id: created.id } }
}

/**
 * Completing a repeating task also records the period it satisfied, so there
 * is a history of the maintenance actually happening — the row itself just
 * reopens next period.
 */
export async function setTaskDone(
  id: string,
  done: boolean
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  // The recurrence bookkeeping lives in `completeTask` so the widget's
  // token-authenticated route runs exactly the same logic.
  const result = await completeTask(id, user.id, done)
  if (!result.ok) return result

  touch()
  return { ok: true }
}

export async function setTaskStage(
  id: string,
  stage: string
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (stage === "done") return setTaskDone(id, true)
  if (!STAGES.includes(stage as (typeof STAGES)[number])) {
    return { ok: false, error: "Unknown stage." }
  }
  await db
    .update(tasks)
    .set({
      status: "open",
      completedAt: null,
      boardStage: stage as (typeof STAGES)[number],
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
  touch()
  return { ok: true }
}

export async function reorderAttentionTasks(ids: string[]): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const ordered = Array.from(new Set(ids)).slice(0, 500)
  if (ordered.length !== ids.length) {
    return { ok: false, error: "That task order is not valid." }
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < ordered.length; index++) {
      await tx
        .update(tasks)
        .set({ sort: index + 1 })
        .where(eq(tasks.id, ordered[index]))
    }
  })

  touch()
  return { ok: true }
}

export type TaskPatch = {
  title?: string
  notes?: string
  dueOn?: string | null
  snoozedUntil?: string | null
  cadence?: Cadence
  priority?: number
  clientId?: string | null
  projectId?: string | null
  productId?: string | null
  deliverableId?: string | null
  retainerId?: string | null
}

export async function updateTask(id: string, patch: TaskPatch): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  if (!existing) return { ok: false, error: "Task not found." }

  const values: Record<string, unknown> = { updatedAt: new Date() }

  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 300)
    if (!title) return { ok: false, error: "A task needs a title." }
    values.title = title
  }
  if (patch.notes !== undefined) values.notes = patch.notes.slice(0, 4000)

  if (patch.dueOn !== undefined) {
    if (patch.dueOn && !isDay(patch.dueOn)) {
      return { ok: false, error: "That due date is not valid." }
    }
    values.dueOn = patch.dueOn || null
  }
  if (patch.snoozedUntil !== undefined) {
    if (patch.snoozedUntil && !isDay(patch.snoozedUntil)) {
      return { ok: false, error: "That snooze date is not valid." }
    }
    values.snoozedUntil = patch.snoozedUntil || null
  }
  if (patch.cadence !== undefined) {
    if (!CADENCES.includes(patch.cadence)) {
      return { ok: false, error: "Unknown repeat." }
    }
    values.cadence = patch.cadence
  }
  if (patch.priority !== undefined) {
    if (![1, 2, 3].includes(patch.priority)) {
      return { ok: false, error: "Priority must be high, normal or low." }
    }
    values.priority = patch.priority
  }

  const retargeting =
    patch.clientId !== undefined ||
    patch.projectId !== undefined ||
    patch.productId !== undefined ||
    patch.deliverableId !== undefined
  if (retargeting) {
    const target = await resolveTarget({
      clientId:
        patch.clientId !== undefined ? patch.clientId : existing.clientId,
      projectId:
        patch.projectId !== undefined ? patch.projectId : existing.projectId,
      productId:
        patch.productId !== undefined ? patch.productId : existing.productId,
      deliverableId:
        patch.deliverableId !== undefined
          ? patch.deliverableId
          : existing.deliverableId,
    })
    if ("error" in target) return { ok: false, error: target.error }
    values.clientId = target.clientId
    values.projectId = target.projectId
    values.productId = target.productId
    values.deliverableId = target.deliverableId
    // Only adopt a derived retainer; never clear one that was set by hand.
    if (target.retainerId) values.retainerId = target.retainerId
  }
  if (patch.retainerId !== undefined) values.retainerId = patch.retainerId || null

  await db.update(tasks).set(values).where(eq(tasks.id, id))
  touch()
  return { ok: true }
}

export async function deleteTask(id: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await db.delete(tasks).where(eq(tasks.id, id))
  touch()
  return { ok: true }
}

/* ---------------- checklist ---------------- */

export async function addChecklistItem(
  taskId: string,
  title: string
): Promise<Result<{ id: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const clean = title.trim().slice(0, 300)
  if (!clean) return { ok: false, error: "That item needs a title." }

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${taskItems.sort}), -1) + 1` })
    .from(taskItems)
    .where(eq(taskItems.taskId, taskId))

  const [row] = await db
    .insert(taskItems)
    .values({ taskId, title: clean, sort: Number(next) })
    .returning({ id: taskItems.id })
  touch()
  return { ok: true, data: { id: row.id } }
}

export async function setChecklistItemDone(
  id: string,
  done: boolean
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await db.update(taskItems).set({ done }).where(eq(taskItems.id, id))
  touch()
  return { ok: true }
}

export async function removeChecklistItem(id: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await db.delete(taskItems).where(eq(taskItems.id, id))
  touch()
  return { ok: true }
}

/* ---------------- views ---------------- */

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

export async function saveView(input: {
  /** Present means overwrite that view; absent means save a new one. */
  id?: string
  name: string
  criteria: unknown
  layout: string
  grouping: string
  sortBy: string
}): Promise<Result<{ slug: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const name = input.name.trim().slice(0, 60)
  if (!name) return { ok: false, error: "Give the view a name." }

  if (input.id) {
    const [row] = await db
      .update(taskViews)
      .set({
        name,
        criteria: input.criteria as object,
        layout: input.layout,
        grouping: input.grouping,
        sortBy: input.sortBy,
      })
      .where(and(eq(taskViews.id, input.id), eq(taskViews.userId, user.id)))
      .returning({ slug: taskViews.slug })
    if (!row) return { ok: false, error: "View not found." }
    touch()
    return { ok: true, data: { slug: row.slug } }
  }

  const base = slugify(name) || "view"
  const taken = await db.query.taskViews.findMany({
    where: eq(taskViews.userId, user.id),
    columns: { slug: true },
  })
  const have = new Set(taken.map((row) => row.slug))
  let slug = base
  let n = 2
  while (have.has(slug)) slug = `${base}-${n++}`

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${taskViews.position}), -1) + 1` })
    .from(taskViews)
    .where(eq(taskViews.userId, user.id))

  const [row] = await db
    .insert(taskViews)
    .values({
      userId: user.id,
      name,
      slug,
      criteria: input.criteria as object,
      layout: input.layout,
      grouping: input.grouping,
      sortBy: input.sortBy,
      position: Number(next),
    })
    .returning({ slug: taskViews.slug })
  touch()
  return { ok: true, data: { slug: row.slug } }
}

export async function deleteView(id: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const view = await db.query.taskViews.findFirst({
    where: and(eq(taskViews.id, id), eq(taskViews.userId, user.id)),
  })
  if (!view) return { ok: false, error: "View not found." }
  if (view.builtIn) {
    return { ok: false, error: "Built-in views can be renamed, not removed." }
  }
  await db.delete(taskViews).where(eq(taskViews.id, id))
  touch()
  return { ok: true }
}
