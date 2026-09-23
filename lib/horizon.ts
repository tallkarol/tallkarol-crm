import type { HubTask } from "@/lib/task-view"

/**
 * The Board's columns are a time horizon derived from the task itself — no
 * hand-set stage. Pure by contract: the Board runs this in the browser after a
 * drop and the page runs it on the server, and they must agree.
 *
 *   week    due on or before this Sunday, including overdue
 *   later   no date, or after Sunday
 *   waiting parked on the client (the old waiting stage, or snoozed)
 *   done    completed in the last DONE_DAYS
 *
 * Dragging INTO a column is what writes: into `week` sets a due date of
 * Sunday when the task has none, into `later` clears it, into `waiting`
 * snoozes a week, into `done` completes. See lib/focus-actions.ts.
 */
export const HORIZONS = ["week", "later", "waiting", "done"] as const
export type Horizon = (typeof HORIZONS)[number]

export const HORIZON_LABEL: Record<Horizon, string> = {
  week: "This week",
  later: "Later",
  waiting: "Waiting",
  done: "Done",
}

/** How long a finished card stays on the board before it leaves. */
export const DONE_DAYS = 7

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The Sunday that closes the week `today` is in (Monday-first weeks). */
export function weekEnd(today: string): string {
  const [y, m, d] = today.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const dow = date.getDay() || 7 // Mon=1 … Sun=7
  date.setDate(date.getDate() + (7 - dow))
  return isoDay(date)
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

export function horizonOf(task: HubTask, today: string): Horizon | null {
  if (task.status === "done") {
    if (!task.completedAt) return null
    const doneDay = task.completedAt.slice(0, 10)
    return daysBetween(doneDay, today) <= DONE_DAYS ? "done" : null
  }
  if (task.stage === "waiting") return "waiting"
  if (task.snoozedUntil && task.snoozedUntil > today) return "waiting"
  if (task.dueOn && task.dueOn <= weekEnd(today)) return "week"
  return "later"
}

export type BoardColumns = Record<Horizon, HubTask[]>

/**
 * Sort inside a column: overdue first, then by due date, then undated by
 * priority. Done sorts newest first. Stable for equal keys.
 */
function compareOpen(a: HubTask, b: HubTask): number {
  if (a.dueOn && b.dueOn && a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1
  if (a.dueOn && !b.dueOn) return -1
  if (!a.dueOn && b.dueOn) return 1
  if (a.priority !== b.priority) return a.priority - b.priority
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
}

export function bandBoard(tasks: HubTask[], today: string, exclude: Set<string> = new Set()): BoardColumns {
  const out: BoardColumns = { week: [], later: [], waiting: [], done: [] }
  for (const task of tasks) {
    if (exclude.has(task.id)) continue
    const h = horizonOf(task, today)
    if (h) out[h].push(task)
  }
  out.week.sort(compareOpen)
  out.later.sort(compareOpen)
  out.waiting.sort(compareOpen)
  out.done.sort((a, b) => ((a.completedAt ?? "") > (b.completedAt ?? "") ? -1 : 1))
  return out
}

export function isOverdue(task: HubTask, today: string): boolean {
  return task.status === "open" && !!task.dueOn && task.dueOn < today
}
