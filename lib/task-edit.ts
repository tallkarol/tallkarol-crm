import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { chatThreads, tasks } from "@/db/schema"
import type { Cadence, Task } from "@/db/schema"
import { cleanLabels, resolveTaskTarget } from "@/lib/task-insert"

/**
 * What editing a task means, with no session attached.
 *
 * Extracted from `updateTask` so the browser's server action and the chat's
 * `edit_task` cannot drift apart — the same reason `completeTask` lives in
 * lib/task-complete.ts. The subtleties worth keeping in one place: a re-file
 * resolves the whole target hierarchically and writes the new house's
 * retainer (including null), and threads bound to the task follow it to its
 * new client.
 *
 * `planTaskPatch` validates and works out the columns without writing, so a
 * chat card can be drawn from exactly what the write will do.
 */

export type TaskPatch = {
  title?: string
  notes?: string
  labels?: string[]
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

export type PlannedPatch =
  | { ok: true; values: Record<string, unknown>; retargeted: boolean }
  | { ok: false; error: string }

const CADENCES: Cadence[] = ["none", "weekly", "monthly", "quarterly"]

function isDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function planTaskPatch(existing: Task, patch: TaskPatch): Promise<PlannedPatch> {
  const values: Record<string, unknown> = { updatedAt: new Date() }

  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 300)
    if (!title) return { ok: false, error: "A task needs a title." }
    values.title = title
  }
  if (patch.notes !== undefined) values.notes = patch.notes.slice(0, 4000)
  if (patch.labels !== undefined) values.labels = cleanLabels(patch.labels)

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

  const retargeted =
    patch.clientId !== undefined ||
    patch.projectId !== undefined ||
    patch.productId !== undefined ||
    patch.deliverableId !== undefined
  if (retargeted) {
    const target = await resolveTaskTarget({
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
    // A move writes the new house's retainer, including null — otherwise a
    // hand-set retainer on the old client follows the task across.
    values.retainerId = target.retainerId
  }
  if (patch.retainerId !== undefined) values.retainerId = patch.retainerId || null

  return { ok: true, values, retargeted }
}

export async function applyTaskPatch(id: string, planned: { values: Record<string, unknown>; retargeted: boolean }) {
  await db.update(tasks).set(planned.values).where(eq(tasks.id, id))

  if (planned.retargeted) {
    await db
      .update(chatThreads)
      .set({ clientId: (planned.values.clientId as string | null) ?? null })
      .where(and(eq(chatThreads.taskId, id), isNull(chatThreads.archivedAt)))
  }
}
