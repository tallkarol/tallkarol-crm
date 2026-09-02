import { db } from "@/db"
import { clients, products, projects, tasks } from "@/db/schema"
import type { Cadence } from "@/db/schema"

/**
 * The one insert every machine-made task goes through — `POST /api/tasks`
 * for a single capture, `createPunchlist()` for a whole list in one
 * transaction. Kept out of `task-actions.ts` because that file is
 * `"use server"` and may only export actions.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type TaskWriter = Tx | typeof db

export type TaskTarget = {
  clientId: string | null
  projectId: string | null
  productId: string | null
  retainerId: string | null
}

/** A project or product implies its client — the same resolution the composer does. */
export async function resolveTaskTarget(input: {
  clientId?: string | null
  projectId?: string | null
  productId?: string | null
}): Promise<TaskTarget | { error: string }> {
  let clientId = input.clientId ?? null
  const projectId = input.projectId ?? null
  const productId = input.productId ?? null

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
    }
  }
  if (productId) {
    const product = await db.query.products.findFirst({
      where: (p, { eq }) => eq(p.id, productId),
    })
    if (!product) return { error: "That product does not exist." }
    return { clientId: product.clientId, projectId: null, productId, retainerId: null }
  }
  if (clientId) {
    const client = await db.query.clients.findFirst({
      where: (c, { eq }) => eq(c.id, clientId!),
      with: { retainers: true },
    })
    if (!client) return { error: "That client does not exist." }
    clientId = client.id
    return {
      clientId,
      projectId: null,
      productId: null,
      retainerId: client.retainers.find((r) => r.status === "active")?.id ?? null,
    }
  }
  return { clientId: null, projectId: null, productId: null, retainerId: null }
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
      dueOn: input.dueOn && DAY.test(input.dueOn) ? input.dueOn : null,
      snoozedUntil:
        input.snoozedUntil && DAY.test(input.snoozedUntil) ? input.snoozedUntil : null,
      cadence: input.cadence ?? "none",
      priority,
      notes: (input.notes ?? "").slice(0, 4000),
      labels: (input.labels ?? [])
        .filter((v) => typeof v === "string" && v.trim())
        .map((v) => v.trim().slice(0, 60))
        .slice(0, 10),
      source: input.source,
      refKind: input.refKind && input.refId ? input.refKind : null,
      refId: input.refKind && input.refId ? input.refId : null,
    })
    .returning({ id: tasks.id })
  return created.id
}

// Referenced so the imports above stay honest when the helper grows.
void clients
void products
void projects
