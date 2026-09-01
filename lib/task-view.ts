import type { Cadence } from "@/db/schema"

/**
 * Shaping the task list: periods, sorting, banding, grouping.
 *
 * Pure by contract — the filter bar and the rows run this in the browser, so
 * nothing in this file may touch the database. Anything that reads Postgres
 * lives in `lib/tasks.ts`.
 */

export const PRIORITY_LABEL: Record<number, string> = {
  1: "High",
  2: "Normal",
  3: "Low",
}

export const STAGE_LABEL: Record<string, string> = {
  queue: "Queue",
  doing: "In progress",
  waiting: "Waiting on client",
}

/** A task parked in "waiting" past this many days rots quietly. */
export const WAITING_ALERT_DAYS = 7

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/* ------------------------------------------------------------------ */
/* periods — one row in task_completions per period a repeat satisfied  */
/* ------------------------------------------------------------------ */

/** ISO week, so a weekly task rolls on Monday rather than seven days later. */
function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

/** The period key a date falls in for a given cadence. */
export function periodKey(cadence: Cadence, at: Date): string | null {
  if (cadence === "none") return null
  if (cadence === "weekly") {
    const { year, week } = isoWeek(at)
    return `${year}-W${pad(week)}`
  }
  if (cadence === "monthly") {
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}`
  }
  return `${at.getFullYear()}-Q${Math.floor(at.getMonth() / 3) + 1}`
}

/** What a repeating row says it is due within. */
export function periodLabel(cadence: Cadence, at = new Date()): string {
  if (cadence === "weekly") {
    const end = new Date(at)
    end.setDate(end.getDate() + ((7 - end.getDay()) % 7))
    return `by ${end.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}`
  }
  if (cadence === "monthly") {
    const end = new Date(at.getFullYear(), at.getMonth() + 1, 0)
    return `by ${end.toLocaleDateString("en-US", { day: "numeric", month: "short" })}`
  }
  if (cadence === "quarterly") {
    const q = Math.floor(at.getMonth() / 3)
    const end = new Date(at.getFullYear(), q * 3 + 3, 0)
    return `by ${end.toLocaleDateString("en-US", { day: "numeric", month: "short" })}`
  }
  return ""
}

/* ------------------------------------------------------------------ */
/* shapes                                                               */
/* ------------------------------------------------------------------ */

export type TaskCriteria = {
  clients?: string[]
  projects?: string[]
  /** open | doing | waiting | done | all */
  state?: string
  /** any | overdue | today | week | none */
  due?: string
  priority?: number[]
  /** any | repeating | once */
  cadence?: string
  /** The one composite: what actually wants attention this morning. */
  needsMe?: boolean
  includeSnoozed?: boolean
}

export type ViewRow = {
  id: string
  name: string
  slug: string
  criteria: TaskCriteria
  layout: string
  grouping: string
  sortBy: string
  position: number
  builtIn: boolean
}

export type HubTask = {
  id: string
  title: string
  notes: string
  status: "open" | "done"
  stage: "queue" | "doing" | "waiting"
  cadence: Cadence
  priority: number
  dueOn: string | null
  snoozedUntil: string | null
  completedAt: string | null
  updatedAt: string
  createdAt: string
  source: string
  clientId: string | null
  clientName: string | null
  clientSlug: string | null
  projectId: string | null
  projectName: string | null
  projectSlug: string | null
  productId: string | null
  productName: string | null
  productSlug: string | null
  retainerName: string | null
  deliverableLabel: string | null
  items: { total: number; done: number }
  /** Days parked in waiting — the number that makes it rot. */
  waitingDays: number | null
  overdueDays: number | null
  periodNote: string | null
}

/* ------------------------------------------------------------------ */
/* filtering                                                            */
/* ------------------------------------------------------------------ */

export function taskMatches(
  task: HubTask,
  criteria: TaskCriteria,
  q: string,
  today: string
): boolean {
  const state = criteria.state ?? "all"
  if (state === "open" && task.status !== "open") return false
  if (state === "done" && task.status !== "done") return false
  if (state === "doing" && !(task.status === "open" && task.stage === "doing")) return false
  if (state === "waiting" && !(task.status === "open" && task.stage === "waiting")) {
    return false
  }

  if (!criteria.includeSnoozed && task.status === "open") {
    if (task.snoozedUntil && task.snoozedUntil > today) return false
  }

  if (criteria.clients?.length) {
    if (!task.clientSlug || !criteria.clients.includes(task.clientSlug)) return false
  }
  if (criteria.projects?.length) {
    if (!task.projectId || !criteria.projects.includes(task.projectId)) return false
  }
  if (criteria.priority?.length && !criteria.priority.includes(task.priority)) {
    return false
  }

  const cadence = criteria.cadence ?? "any"
  if (cadence === "repeating" && task.cadence === "none") return false
  if (cadence === "once" && task.cadence !== "none") return false

  const due = criteria.due ?? "any"
  if (due === "overdue" && !(task.dueOn && task.dueOn < today)) return false
  if (due === "today" && !(task.dueOn && task.dueOn <= today)) return false
  if (due === "none" && task.dueOn) return false
  if (due === "week") {
    if (!task.dueOn) return false
    if (task.dueOn < today || daysBetween(today, task.dueOn) > 7) return false
  }

  if (criteria.needsMe) {
    const dueNow = task.dueOn != null && task.dueOn <= today
    const inFlight = task.stage === "doing"
    const urgent = task.priority === 1
    const repeatDue = task.cadence !== "none"
    if (!dueNow && !inFlight && !urgent && !repeatDue) return false
  }

  if (q.trim()) {
    const needle = q.trim().toLowerCase()
    const hay = [
      task.title,
      task.notes,
      task.clientName ?? "",
      task.projectName ?? "",
      task.productName ?? "",
    ]
      .join(" ")
      .toLowerCase()
    if (!hay.includes(needle)) return false
  }

  return true
}

/* ------------------------------------------------------------------ */
/* sorting, grouping, banding                                           */
/* ------------------------------------------------------------------ */

export const SORTS = [
  { id: "due", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "client", label: "Client" },
  { id: "created", label: "Newest first" },
  { id: "updated", label: "Recently touched" },
  { id: "completed", label: "Recently done" },
] as const

export const GROUPS = [
  { id: "none", label: "Flat" },
  { id: "due", label: "By due" },
  { id: "client", label: "By client" },
  { id: "project", label: "By project" },
  { id: "priority", label: "By priority" },
  { id: "stage", label: "By stage" },
] as const

export const STATES = [
  { id: "all", label: "Any state" },
  { id: "open", label: "Open" },
  { id: "doing", label: "In progress" },
  { id: "waiting", label: "Waiting on client" },
  { id: "done", label: "Done" },
] as const

export function sortTasks(list: HubTask[], sortBy: string): HubTask[] {
  const rows = [...list]
  const far = "9999-12-31"
  rows.sort((a, b) => {
    // Done always sinks, whatever else is asked for.
    const ad = a.status === "done" ? 1 : 0
    const bd = b.status === "done" ? 1 : 0
    if (ad !== bd) return ad - bd

    if (sortBy === "priority") {
      if (a.priority !== b.priority) return a.priority - b.priority
      return (a.dueOn ?? far) < (b.dueOn ?? far) ? -1 : 1
    }
    if (sortBy === "client") {
      const ac = a.clientName ?? "~"
      const bc = b.clientName ?? "~"
      if (ac !== bc) return ac.localeCompare(bc)
      return (a.dueOn ?? far) < (b.dueOn ?? far) ? -1 : 1
    }
    if (sortBy === "created") return a.createdAt < b.createdAt ? 1 : -1
    if (sortBy === "updated") return a.updatedAt < b.updatedAt ? 1 : -1
    if (sortBy === "completed") {
      return (a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1
    }
    const av = a.dueOn ?? far
    const bv = b.dueOn ?? far
    if (av !== bv) return av < bv ? -1 : 1
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.createdAt < b.createdAt ? -1 : 1
  })
  return rows
}

/**
 * The band a row belongs to is a run of whatever the list is ordered by, so a
 * band is always a true statement about the rows inside it — never
 * every-other-row striping.
 */
export function bandKey(task: HubTask, sortBy: string, today: string): string {
  if (task.status === "done") return "done"
  if (sortBy === "priority") return `p${task.priority}`
  if (sortBy === "client") return task.clientSlug ?? "none"
  if (sortBy === "created" || sortBy === "updated" || sortBy === "completed") {
    const stamp = (
      sortBy === "created"
        ? task.createdAt
        : sortBy === "updated"
          ? task.updatedAt
          : task.completedAt ?? task.updatedAt
    ).slice(0, 10)
    const age = daysBetween(stamp, today)
    return age <= 0 ? "today" : age <= 7 ? "this week" : "older"
  }
  if (!task.dueOn) return task.cadence !== "none" ? "repeating" : "undated"
  if (task.dueOn < today) return "overdue"
  if (task.dueOn === today) return "today"
  return daysBetween(today, task.dueOn) <= 7 ? "this week" : "later"
}

const BAND_TITLE: Record<string, string> = {
  overdue: "Overdue",
  today: "Today",
  "this week": "This week",
  later: "Later",
  undated: "No date",
  repeating: "Repeating",
  older: "Older",
  done: "Done",
  none: "No client",
  p1: "High priority",
  p2: "Normal priority",
  p3: "Low priority",
}

export function groupKey(task: HubTask, grouping: string, today: string): string {
  if (grouping === "client") return task.clientSlug ?? "none"
  if (grouping === "project") return task.projectId ?? "none"
  if (grouping === "priority") return `p${task.priority}`
  if (grouping === "stage") return task.status === "done" ? "done" : task.stage
  return bandKey(task, "due", today)
}

export function groupTitle(key: string, grouping: string, task: HubTask): string {
  if (grouping === "client") {
    return task.clientName ?? task.productName ?? "No client"
  }
  if (grouping === "project") return task.projectName ?? "No project"
  if (grouping === "priority") return PRIORITY_LABEL[task.priority] ?? "Normal"
  if (grouping === "stage") {
    return task.status === "done" ? "Done" : STAGE_LABEL[task.stage] ?? task.stage
  }
  return BAND_TITLE[key] ?? key
}

export type RenderRow = HubTask & { band: 0 | 1; first: boolean }
export type RenderGroup = { key: string; title: string; color: string | null; rows: RenderRow[] }

/** Rows with their band index, or named groups when grouping is on. */
export function layoutRows(
  list: HubTask[],
  sortBy: string,
  grouping: string,
  now = new Date()
): { rows: RenderRow[]; groups: RenderGroup[] | null } {
  const today = isoDay(now)
  const sorted = sortTasks(list, sortBy)

  if (grouping !== "none") {
    const order: string[] = []
    const buckets = new Map<string, HubTask[]>()
    for (const task of sorted) {
      const key = groupKey(task, grouping, today)
      if (!buckets.has(key)) {
        buckets.set(key, [])
        order.push(key)
      }
      buckets.get(key)!.push(task)
    }
    const groups = order.map((key, index) => {
      const rows = buckets.get(key)!
      return {
        key,
        title: groupTitle(key, grouping, rows[0]),
        color:
          grouping === "client"
            ? rows[0].clientSlug ?? rows[0].productSlug
            : null,
        rows: rows.map((task, i) => ({
          ...task,
          band: (index % 2) as 0 | 1,
          first: i === 0,
        })),
      }
    })
    return { rows: groups.flatMap((g) => g.rows), groups }
  }

  let band: 0 | 1 = 0
  let previous: string | null = null
  const rows = sorted.map((task) => {
    const key = bandKey(task, sortBy, today)
    const first = key !== previous
    if (first && previous !== null) band = band === 0 ? 1 : 0
    previous = key
    return { ...task, band, first }
  })
  return { rows, groups: null }
}
