import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { taskCompletions, tasks } from "@/db/schema"
import { isoDay, periodKey } from "@/lib/task-view"

/**
 * What "done" means for a task, with no session attached.
 *
 * Extracted so the browser's server action (`setTaskDone`) and the widget's
 * token-authenticated route cannot drift apart. The subtlety worth keeping in
 * one place is recurrence: ticking a repeating task is not just a status flip,
 * it also records the period that tick satisfied, and un-ticking inside the
 * same period retracts that record. A second implementation would get this
 * wrong on the first edit.
 *
 * Reopening also returns the row to `queue`. Without that, un-ticking a task
 * that was finished from `doing` brought it back mid-flight, and one finished
 * from `waiting` reappeared in the waiting lens with a fresh `updated_at` —
 * so it would not even read as rotting. `reopenDueRecurring()` has always
 * done this for repeats; the two paths agree now.
 */

export type CompleteResult =
  | { ok: true; title: string; cadence: string; period: string | null }
  | { ok: false; error: string }

export async function completeTask(
  id: string,
  userId: string | null,
  done: boolean,
  now = new Date()
): Promise<CompleteResult> {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  if (!task) return { ok: false, error: "Task not found." }

  await db
    .update(tasks)
    .set({
      status: done ? "done" : "open",
      completedAt: done ? now : null,
      ...(done ? {} : { boardStage: "queue" as const }),
      updatedAt: now,
    })
    .where(eq(tasks.id, id))

  let period: string | null = null

  if (done && task.cadence !== "none") {
    period = periodKey(task.cadence, now)
    if (period) {
      await db
        .insert(taskCompletions)
        .values({ taskId: id, userId, period, completedOn: isoDay(now) })
        .onConflictDoNothing()
    }
  }

  if (!done && task.cadence !== "none" && task.completedAt) {
    // Un-ticking within the same period retracts that period's record.
    period = periodKey(task.cadence, task.completedAt)
    if (period) {
      await db
        .delete(taskCompletions)
        .where(
          and(eq(taskCompletions.taskId, id), eq(taskCompletions.period, period))
        )
    }
  }

  return { ok: true, title: task.title, cadence: task.cadence, period }
}
