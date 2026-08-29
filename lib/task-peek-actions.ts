"use server"

import type { Cadence } from "@/db/schema"
import {
  setTaskDone,
  setTaskStage,
  updateTask,
} from "@/lib/task-actions"

/**
 * Single-value setters, shaped for the peek controls.
 *
 * `PickButtons`, `DueDateControl` and friends take a one-argument action, and
 * only a *bound* server action may cross into a client component — so each of
 * these takes the id first and is handed over as `action.bind(null, task.id)`.
 */

type Result = { ok: boolean; error?: string }

export async function setTaskTitleAction(id: string, title: string): Promise<Result> {
  return updateTask(id, { title })
}

export async function setTaskNotesAction(id: string, notes: string): Promise<Result> {
  return updateTask(id, { notes })
}

export async function setTaskDueAction(
  id: string,
  dueOn: string | null
): Promise<Result> {
  return updateTask(id, { dueOn })
}

export async function setTaskSnoozeAction(
  id: string,
  snoozedUntil: string | null
): Promise<Result> {
  return updateTask(id, { snoozedUntil })
}

export async function setTaskCadenceAction(
  id: string,
  cadence: string
): Promise<Result> {
  return updateTask(id, { cadence: cadence as Cadence })
}

export async function setTaskPriorityAction(
  id: string,
  priority: string
): Promise<Result> {
  return updateTask(id, { priority: Number(priority) })
}

export async function setTaskStageAction(id: string, stage: string): Promise<Result> {
  return setTaskStage(id, stage)
}

export async function setTaskStatusAction(id: string, done: boolean): Promise<Result> {
  return setTaskDone(id, done)
}
