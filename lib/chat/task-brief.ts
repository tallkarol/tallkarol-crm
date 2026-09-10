import { PRIORITY_LABEL, STAGE_LABEL } from "@/lib/task-view"

/**
 * The first message of a task thread.
 *
 * Pure by contract: the queue route rebuilds it on every claim, the check
 * script asserts on it, and nothing here touches the database —
 * `lib/chat/task-thread.ts` loads the task and hands it over.
 *
 * The first line becomes the thread's title (`titleFrom` in turns.ts cuts a
 * first line at 72 characters), so the title is clipped here to keep it whole.
 */

export type TaskBriefInput = {
  id: string
  title: string
  notes: string
  labels: string[]
  dueOn: string | null
  priority: number
  boardStage: string
  status: string
  cadence: string
  source: string
  client: { slug: string; name: string } | null
  project: { slug: string; name: string } | null
  product: { slug: string; name: string } | null
  retainer: { name: string } | null
  deliverable: { label: string; title: string } | null
  checklist: { title: string; done: boolean }[]
  punchlist: { listTitle: string; reported: string; outcome: string } | null
  /** Where the task lives in the CRM, as a relative path. */
  url: string
}

export const BRIEF_PREFIX = "Solve: "
/** `titleFrom` in turns.ts keeps a first line whole up to this many characters. */
export const TITLE_MAX = 72
const TITLE_ROOM = TITLE_MAX - BRIEF_PREFIX.length

function clip(text: string, max: number): string {
  const line = text.trim().replace(/\s+/g, " ")
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** The same words the task card uses for `tasks.source`, lowercased for prose. */
const SOURCE_WORD: Record<string, string> = {
  manual: "added by hand",
  renewal: "auto-created from a retainer window",
  api: "captured from a device",
  ticket: "made from a support ticket",
  meeting: "made from a meeting",
  notion: "accepted from a notebook",
  punchlist: "an item on a punch list",
  leftoff: "converted from a left-off note",
  chat: "created from chat",
  mail: "made from mail",
}

export function taskBrief(t: TaskBriefInput): string {
  const lines: string[] = [`${BRIEF_PREFIX}${clip(t.title, TITLE_ROOM)}`, ""]

  if (t.client) lines.push(`Client: ${t.client.name} (${t.client.slug})`)
  else if (!t.product) lines.push("Client: none (house task)")
  if (t.project) lines.push(`Project: ${t.project.name} (${t.project.slug})`)
  if (t.product) lines.push(`Product: ${t.product.name} (${t.product.slug})`)
  if (t.retainer) lines.push(`Retainer: ${t.retainer.name}`)
  if (t.deliverable) {
    lines.push(
      `Deliverable: ${
        t.deliverable.title
          ? `${t.deliverable.label} · ${t.deliverable.title}`
          : t.deliverable.label
      }`
    )
  }

  const facts: string[] = []
  if (t.dueOn) facts.push(`Due ${t.dueOn}`)
  facts.push(`Priority ${(PRIORITY_LABEL[t.priority] ?? String(t.priority)).toLowerCase()}`)
  facts.push(`Stage ${(STAGE_LABEL[t.boardStage] ?? t.boardStage).toLowerCase()}`)
  if (t.status === "done") facts.push("already marked done")
  if (t.cadence && t.cadence !== "none") facts.push(`repeats ${t.cadence}`)
  if (t.labels.length) facts.push(`labels ${t.labels.join(", ")}`)
  lines.push(facts.join(" · "))

  if (t.notes.trim()) lines.push("", "Notes:", t.notes.trim())

  if (t.checklist.length) {
    lines.push("", "Checklist:")
    for (const item of t.checklist) lines.push(`${item.done ? "[x]" : "[ ]"} ${item.title}`)
  }

  if (t.punchlist) {
    lines.push("", `Punch list: ${t.punchlist.listTitle}`)
    if (t.punchlist.reported.trim()) lines.push(`Reported: ${t.punchlist.reported.trim()}`)
    if (t.punchlist.outcome.trim()) lines.push(`Outcome: ${t.punchlist.outcome.trim()}`)
  }

  lines.push("", `Source: ${SOURCE_WORD[t.source] ?? t.source}`, `CRM: ${t.url}`)
  return lines.join("\n")
}

/**
 * The branch a solve runs on. The CRM names it and the worker cuts it, so the
 * card, the reply and `git branch` all say the same thing.
 */
export function solveBranch(taskId: string): string {
  return `solve/${taskId.slice(0, 8)}`
}
