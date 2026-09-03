import { db } from "@/db"
import { tasks } from "@/db/schema"
import type { Cadence } from "@/db/schema"

/**
 * The one insert every machine-made task goes through — `POST /api/tasks`
 * for a single capture, `createPunchlist()` for a whole list in one
 * transaction, `ensureRenewalTasks()` for the T-30 sweep. Kept out of
 * `task-actions.ts` because that file is `"use server"` and may only export
 * actions; `createTask()` resolves its target through here too, so the
 * browser and the device token cannot land differently-shaped rows.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type TaskWriter = Tx | typeof db

export type TaskTarget = {
  clientId: string | null
  projectId: string | null
  productId: string | null
  retainerId: string | null
  deliverableId: string | null
}

/**
 * Where a task hangs. Resolution is hierarchical and each level fills in the
 * ones above it: a deliverable implies its project, a project implies its
 * client and retainer, a product may stand alone (Tall Karol products have no
 * client). Whichever level wins clears the others — a task is filed in one
 * place, not several.
 */
export async function resolveTaskTarget(input: {
  clientId?: string | null
  projectId?: string | null
  productId?: string | null
  deliverableId?: string | null
}): Promise<TaskTarget | { error: string }> {
  const clientId = input.clientId || null
  const projectId = input.projectId || null
  const productId = input.productId || null
  const deliverableId = input.deliverableId || null

  if (deliverableId) {
    const deliverable = await db.query.deliverables.findFirst({
      where: (d, { eq }) => eq(d.id, deliverableId),
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
      where: (p, { eq }) => eq(p.id, projectId),
    })
    if (!project) return { error: "That project does not exist." }
    return {
      clientId: project.clientId,
      projectId,
      productId: null,
      retainerId: project.retainerId,
      deliverableId: null,
    }
  }

  if (productId) {
    const product = await db.query.products.findFirst({
      where: (p, { eq }) => eq(p.id, productId),
    })
    if (!product) return { error: "That product does not exist." }
    return {
      clientId: product.clientId,
      projectId: null,
      productId,
      retainerId: null,
      deliverableId: null,
    }
  }

  if (clientId) {
    const client = await db.query.clients.findFirst({
      where: (c, { eq }) => eq(c.id, clientId),
      with: { retainers: true },
    })
    if (!client) return { error: "That client does not exist." }
    return {
      clientId: client.id,
      projectId: null,
      productId: null,
      retainerId: client.retainers.find((r) => r.status === "active")?.id ?? null,
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

export type TaskRowInput = {
  title: string
  userId: string | null
  target: TaskTarget
  dueOn?: string | null
  snoozedUntil?: string | null
  cadence?: Cadence
  priority?: number
  notes?: string
  labels?: string[]
  source: string
  refKind?: string | null
  refId?: string | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Free-array contract, same as `support_tickets.tags`: ten, trimmed, ≤60 chars. */
export function cleanLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().slice(0, 60))
    .slice(0, 10)
}

export async function insertTaskRow(writer: TaskWriter, input: TaskRowInput) {
  const title = input.title.trim().slice(0, 300)
  if (!title) throw new Error("A task needs a title.")
  const priority = [1, 2, 3].includes(input.priority ?? 2) ? (input.priority ?? 2) : 2
  const [created] = await writer
    .insert(tasks)
    .values({
      title,
      userId: input.userId,
      clientId: input.target.clientId,
      projectId: input.target.projectId,
      productId: input.target.productId,
      retainerId: input.target.retainerId,
      deliverableId: input.target.deliverableId,
      dueOn: input.dueOn && DAY.test(input.dueOn) ? input.dueOn : null,
      snoozedUntil:
        input.snoozedUntil && DAY.test(input.snoozedUntil) ? input.snoozedUntil : null,
      cadence: input.cadence ?? "none",
      priority,
      notes: (input.notes ?? "").slice(0, 4000),
      labels: cleanLabels(input.labels),
      source: input.source,
      refKind: input.refKind && input.refId ? input.refKind : null,
      refId: input.refKind && input.refId ? input.refId : null,
    })
    .returning({ id: tasks.id })
  return created.id
}
