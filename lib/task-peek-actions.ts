"use server"

import type { Cadence } from "@/db/schema"
import {
  setTaskDone,
  setTaskStage,
  updateTask,
} from "@/lib/task-actions"
import { tracked } from "@/lib/activity/tracked"

/**
 * Single-value setters, shaped for the peek controls.
 *
 * `PickButtons`, `DueDateControl` and friends take a one-argument action, and
 * only a *bound* server action may cross into a client component — so each of
 * these takes the id first and is handed over as `action.bind(null, task.id)`.
 */

type Result = { ok: boolean; error?: string }

export const setTaskTitleAction = tracked("taskPeek.setTaskTitleAction", async function setTaskTitleAction(id: string, title: string): Promise<Result> {
  return updateTask(id, { title })
})

export const setTaskNotesAction = tracked("taskPeek.setTaskNotesAction", async function setTaskNotesAction(id: string, notes: string): Promise<Result> {
  return updateTask(id, { notes })
})

export const setTaskDueAction = tracked("taskPeek.setTaskDueAction", async function setTaskDueAction(
  id: string,
  dueOn: string | null
): Promise<Result> {
  return updateTask(id, { dueOn })
})

export const setTaskSnoozeAction = tracked("taskPeek.setTaskSnoozeAction", async function setTaskSnoozeAction(
  id: string,
  snoozedUntil: string | null
): Promise<Result> {
  return updateTask(id, { snoozedUntil })
})

export const setTaskCadenceAction = tracked("taskPeek.setTaskCadenceAction", async function setTaskCadenceAction(
  id: string,
  cadence: string
): Promise<Result> {
  return updateTask(id, { cadence: cadence as Cadence })
})

export const setTaskPriorityAction = tracked("taskPeek.setTaskPriorityAction", async function setTaskPriorityAction(
  id: string,
  priority: string
): Promise<Result> {
  return updateTask(id, { priority: Number(priority) })
})

export const setTaskStageAction = tracked("taskPeek.setTaskStageAction", async function setTaskStageAction(id: string, stage: string): Promise<Result> {
  return setTaskStage(id, stage)
})

export const setTaskStatusAction = tracked("taskPeek.setTaskStatusAction", async function setTaskStatusAction(id: string, done: boolean): Promise<Result> {
  return setTaskDone(id, done)
})
