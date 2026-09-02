import { z } from "zod"
import type { PunchlistTestSpec } from "@/db/schema"

/**
 * The pure half of punch lists — grouping, progress, the state an item is in,
 * and the test-spec contract. No db import: the list page's client
 * components read from here, and `scripts/check-punchlist.ts` proves the
 * maths without a database.
 *
 * "Punch" on its own already means the time clock in this app
 * (`lib/punch.ts`, `time_punches`). Everything here is spelled `punchlist`,
 * one word, so a grep for either never returns the other.
 */

/** The three states Karol's own punch lists cycle through, plus waiting. */
export type ItemState = "todo" | "doing" | "waiting" | "done"

export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  todo: "To do",
  doing: "Doing",
  waiting: "Waiting",
  done: "Done",
}

/** What the state circle moves to on a click. Waiting is set from the task, never cycled into. */
export const NEXT_STATE: Record<ItemState, ItemState> = {
  todo: "doing",
  doing: "done",
  waiting: "doing",
  done: "todo",
}

/** The task columns an item's state is read from. */
export type ItemTaskFacts = {
  status: "open" | "done"
  boardStage: "queue" | "doing" | "waiting"
}

export function itemState(task: ItemTaskFacts | null | undefined): ItemState {
  if (!task) return "todo"
  if (task.status === "done") return "done"
  if (task.boardStage === "doing") return "doing"
  if (task.boardStage === "waiting") return "waiting"
  return "todo"
}

/** The task write that moves an item into `state`. */
export function stateToTask(state: ItemState): { done: boolean; stage?: "queue" | "doing" | "waiting" } {
  if (state === "done") return { done: true }
  if (state === "doing") return { done: false, stage: "doing" }
  if (state === "waiting") return { done: false, stage: "waiting" }
  return { done: false, stage: "queue" }
}

export type ItemView = {
  id: string
  section: string
  sectionSort: number
  sort: number
  title: string
  kind: string
  reported: string
  outcome: string
  taskId: string | null
  state: ItemState
  test: PunchlistTestSpec | null
  lastTestStatus: string
}

export type SectionView = {
  section: string
  sectionSort: number
  items: ItemView[]
  done: number
  total: number
}

export function groupBySection(items: ItemView[]): SectionView[] {
  const map = new Map<string, SectionView>()
  for (const item of items) {
    const key = item.section
    let section = map.get(key)
    if (!section) {
      section = { section: key, sectionSort: item.sectionSort, items: [], done: 0, total: 0 }
      map.set(key, section)
    }
    section.items.push(item)
    section.total += 1
    if (item.state === "done") section.done += 1
  }
  const sections = Array.from(map.values())
  for (const section of sections) {
    section.items.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))
  }
  return sections.sort(
    (a, b) => a.sectionSort - b.sectionSort || a.section.localeCompare(b.section)
  )
}

export type Progress = { done: number; total: number; pct: number }

export function progress(items: Pick<ItemView, "state">[]): Progress {
  const total = items.length
  const done = items.filter((i) => i.state === "done").length
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/**
 * The status the list should show. `draft`/`void` are stored and kept; an
 * `open` list whose every item is done reads as `done`, and a `done` list
 * with something reopened reads as `open` again — the column is a floor, not
 * a fact, so nothing has to write it on every tick.
 */
export function listStatus(
  stored: "draft" | "open" | "done" | "void",
  items: Pick<ItemView, "state">[]
): "draft" | "open" | "done" | "void" {
  if (stored === "draft" || stored === "void") return stored
  if (items.length === 0) return stored
  return items.every((i) => i.state === "done") ? "done" : "open"
}

export const LIST_STATUS_LABEL: Record<"draft" | "open" | "done" | "void", string> = {
  draft: "Draft",
  open: "Open",
  done: "Done",
  void: "Void",
}

export const SOURCE_KIND_LABEL: Record<string, string> = {
  mail: "from mail",
  doc: "from a document",
  transcript: "from a transcript",
  manual: "by hand",
}

/** `All / To do / Doing / Done` chips on the list page. */
export type StateFilter = "all" | "todo" | "doing" | "done"

export function matchesState(item: Pick<ItemView, "state">, filter: StateFilter) {
  if (filter === "all") return true
  if (filter === "todo") return item.state === "todo" || item.state === "waiting"
  return item.state === filter
}

/* ------------------------------------------------------------------ */
/* test spec                                                            */
/* ------------------------------------------------------------------ */

export const TestSpecSchema = z.object({
  kind: z.enum(["browser", "http", "command", "manual"]),
  url: z.string().url().optional(),
  method: z.string().max(10).optional(),
  repo: z.string().max(200).optional(),
  command: z.string().max(2000).optional(),
  steps: z.array(z.string().max(1000)).max(40).optional(),
  expect: z.string().min(1).max(2000),
  evidence: z.array(z.string().max(40)).max(10).optional(),
  timeoutSec: z.number().int().min(5).max(3600).optional(),
})

/** Parse a spec from anything the API or CLI sent. `null` clears the test. */
export function parseTestSpec(
  raw: unknown
): { ok: true; spec: PunchlistTestSpec | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, spec: null }
  const result = TestSpecSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    return { ok: false, error: `test: ${issue.path.join(".") || "spec"} — ${issue.message}` }
  }
  const spec = result.data
  if ((spec.kind === "browser" || spec.kind === "http") && !spec.url) {
    return { ok: false, error: `test: a ${spec.kind} test needs a url.` }
  }
  if (spec.kind === "command" && !spec.command) {
    return { ok: false, error: "test: a command test needs a command." }
  }
  return { ok: true, spec }
}

export const RUN_STATUSES = ["queued", "running", "pass", "fail", "blocked", "cancelled"] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  pass: "Pass",
  fail: "Fail",
  blocked: "Blocked",
  cancelled: "Cancelled",
}

/**
 * The only moves a run may make. A report may land straight from `queued`
 * (a runner that never bothered to claim); terminal states never move.
 */
export function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === "queued" || from === "running") return to !== "queued" && to !== from
  return false
}

export function isTerminal(status: RunStatus): boolean {
  return status === "pass" || status === "fail" || status === "blocked" || status === "cancelled"
}

/* ------------------------------------------------------------------ */
/* slugs                                                                */
/* ------------------------------------------------------------------ */

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}
