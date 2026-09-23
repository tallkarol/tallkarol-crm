/**
 * Focus — the post-its. Pure by contract: the tray runs this in the browser
 * after a drop, the page runs it on the server, and `focus-actions.ts` runs
 * it before writing. Nothing here may touch the database (that is
 * `lib/focus-data.ts`).
 *
 * A client's set is an ordered list. The first `FOCUS_MAX[mode]` rows are the
 * showing slots; everything after is the queue, in order. Mode (3 or 1) is a
 * per-user view setting, never data — switching it moves nothing.
 */
export const FOCUS_KINDS = ["task", "ticket", "deliverable", "mail"] as const
export type FocusKind = (typeof FOCUS_KINDS)[number]

export function isFocusKind(value: unknown): value is FocusKind {
  return (FOCUS_KINDS as readonly string[]).includes(value as string)
}

export const FOCUS_MODES = ["three", "one"] as const
export type FocusMode = (typeof FOCUS_MODES)[number]
export const FOCUS_MAX: Record<FocusMode, number> = { three: 3, one: 1 }
export const FOCUS_MODE_COOKIE = "tk_focus_mode"

export function isFocusMode(value: unknown): value is FocusMode {
  return value === "three" || value === "one"
}

/** Paper colours. The kind picks one; a row may override it. */
export const PAPERS = ["task", "ticket", "deliverable", "punch", "note", "money"] as const
export type Paper = (typeof PAPERS)[number]

export function isPaper(value: unknown): value is Paper {
  return (PAPERS as readonly string[]).includes(value as string)
}

export const KIND_LABEL: Record<FocusKind, string> = {
  task: "Task",
  ticket: "Ticket",
  deliverable: "Deliverable",
  mail: "Email",
}

export const PAPER_LABEL: Record<Paper, string> = {
  task: "Task",
  ticket: "Ticket",
  deliverable: "Deliverable",
  punch: "Punch item",
  note: "Note",
  money: "Money",
}

/**
 * What the tray renders. Built by `focus-data.ts` from the row plus the
 * record it points at; everything a card shows is here so the client
 * component never joins anything.
 */
export type FocusCard = {
  /** The focus row id — what drags and actions address. */
  id: string
  refKind: FocusKind
  refId: string
  position: number
  global: boolean
  paper: Paper
  title: string
  /** "Titles and descriptions · D3" — the line under the title. */
  project: string | null
  /** ISO day when the item has one. */
  dueOn: string | null
  /** The due/age line as the card prints it: "Wed 24", "2d, no reply". */
  dueLabel: string | null
  overdue: boolean
  checklist: { done: number; total: number } | null
  /** Checklist step titles, for the desk sheet. */
  steps: { id: string; title: string; done: boolean }[]
  notes: string
  /** Where "Open" goes. */
  href: string
  /** The client that owns the row — the flag on a global note. */
  clientSlug: string
  clientName: string
}

export function paperFor(kind: FocusKind, override: string | null | undefined, source?: string | null): Paper {
  if (isPaper(override)) return override
  if (kind === "task" && source === "punchlist") return "punch"
  if (kind === "mail") return "note"
  return kind
}

export type FocusWindow = { showing: FocusCard[]; queue: FocusCard[] }

export function windowOf(cards: FocusCard[], mode: FocusMode): FocusWindow {
  const sorted = [...cards].sort((a, b) => a.position - b.position)
  const max = FOCUS_MAX[mode]
  return { showing: sorted.slice(0, max), queue: sorted.slice(max) }
}

/**
 * Where a dropped row lands. `slot` is an index into the showing window;
 * `queue` is an index into the queue (or its end); `front` is position 0.
 * Returns the new full ordering of ids.
 */
export function placeInOrder(
  order: string[],
  id: string,
  target: { slot: number } | { queue: number | null } | { front: true },
  mode: FocusMode
): string[] {
  const without = order.filter((x) => x !== id)
  const max = FOCUS_MAX[mode]
  let index: number
  if ("front" in target) index = 0
  else if ("slot" in target) index = Math.max(0, Math.min(target.slot, without.length))
  else index = target.queue == null ? without.length : Math.max(max, Math.min(max + target.queue, without.length))
  without.splice(index, 0, id)
  return without
}

/** Renumber so positions are 0..n-1 in the given order. */
export function renumber(order: string[]): { id: string; position: number }[] {
  return order.map((id, position) => ({ id, position }))
}

/** Day label the cards print: "Wed 24" this week, "Oct 6" beyond. */
export function dueLabelFor(dueOn: string | null, today: string): string | null {
  if (!dueOn) return null
  const [y, m, d] = dueOn.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const [ty, tm, td] = today.split("-").map(Number)
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  if (diff > 1 && diff < 7) return `${WEEKDAY[date.getDay()]} ${d}`
  return `${MONTH[m - 1]} ${d}`
}
