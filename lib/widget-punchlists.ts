import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import { ROUTES } from "@/lib/nav"
import type { ItemState, ItemView } from "@/lib/punchlist"
import {
  listPunchlists,
  loadPunchlist,
  type PunchlistSummary,
  type PunchlistView,
} from "@/lib/punchlists"
import { roundRobinByClient } from "@/lib/widget"

/**
 * The Punch List widget.
 *
 * Built on `listPunchlists()` and `loadPunchlist()` rather than a second set of
 * queries, because an item has no done flag of its own: its state is
 * `itemState(task)` over the task it points at. A widget that re-derived that
 * would be one refactor away from disagreeing with `/punchlists/[slug]` about
 * whether a row is ticked, and the whole point of the list is that ticking it
 * anywhere ticks it everywhere.
 *
 * Both loaders are unbounded reads that join every item to its task, so both
 * sides of this module are memoised for a minute the way `cachedDelivery` in
 * `lib/widget.ts` is — the index, the detail, and the picker behind the
 * widget's configuration sheet all wake on the same cadence and arrive
 * together.
 *
 * Counts and shares only. Nothing here carries money, and nothing here writes:
 * a tick goes through the existing `POST /api/widget/complete/<taskId>`, which
 * is why every item ships the `taskId` it was cut into.
 */

/* ------------------------------------------------------------------ types */

/** The row the index draws and the configuration picker lists. */
export type PunchlistWidgetSummary = {
  slug: string
  title: string
  client: string
  clientSlug: string
  project: string | null
  /** The client's accent, so two lists on one tile are told apart by colour. */
  color: string
  /** Effective status — an open list whose items are all done reads `done`. */
  status: "draft" | "open" | "done" | "void"
  total: number
  done: number
  /** Items not done — todo, doing and waiting together. */
  open: number
  /** `done / total`, 0..1. Zero for an empty list, never a division by zero. */
  share: number
  /** "12 of 25 done · 2 failing" — one line, already written. */
  statusLine: string
  failingTests: number
  /** "Pedro's hitlist (Aug 31)", a filename, an inbox id — may be "". */
  sourceRef: string
  updatedAt: string
  href: string
}

export type PunchlistWidgetItem = {
  id: string
  /** The task to tick through `POST /api/widget/complete/<taskId>`. */
  taskId: string | null
  /** Position in the filed list, 1-based — the number the page prints. */
  index: number
  /** "A · Answers & decisions". "" when the source had no headings. */
  section: string
  title: string
  /** The chip: "theme PR", "bundle", "held". "" when unset. */
  kind: string
  state: ItemState
  /** The client's own words. Verbatim, only ever cut at the cap below. */
  reported: string
  /** What "done" means for this item. Same treatment. */
  outcome: string
  /** True when `reported` or `outcome` hit the cap. */
  truncated: boolean
  /** queued | running | pass | fail | blocked, or "" when it has no test. */
  testStatus: string
  href: string
}

export type PunchlistIndexPayload = {
  lists: PunchlistWidgetSummary[]
  counts: { lists: number; items: number; done: number; open: number }
  /** Open lists beyond the cap, so a tile can say "+3 more" honestly. */
  more: number
}

export type PunchlistDetailPayload = {
  list: PunchlistWidgetSummary
  /** The line under the title — where the list came from. May be "". */
  intro: string
  counts: { todo: number; doing: number; waiting: number; done: number }
  /** The next open items in filed order. Done items are never returned. */
  items: PunchlistWidgetItem[]
  /** Open items past the ones returned. */
  remaining: number
  limit: number
}

/* -------------------------------------------------------------- constants */

/** Enough for a picker with room to spare; production runs one open list. */
const MAX_LISTS = 20

export const DEFAULT_ITEM_LIMIT = 8
export const MAX_ITEM_LIMIT = 40

/**
 * Generous, because the widget shows the client's sentence and a sentence cut
 * mid-clause is worse than a long one. `reported` is stored up to 8 000 chars;
 * anything past this is a wall of text no tile was going to draw.
 */
const REPORTED_CAP = 1500
const OUTCOME_CAP = 1000

/* ---------------------------------------------------------------- shaping */

function cap(text: string, limit: number): { text: string; cut: boolean } {
  if (text.length <= limit) return { text, cut: false }
  return { text: text.slice(0, limit), cut: true }
}

function share(done: number, total: number) {
  if (total <= 0) return 0
  return Math.round((done / total) * 1000) / 1000
}

/** Mirrors `summarize()` in `lib/punchlists.ts` — same buckets, same rules. */
function testCounts(items: Pick<ItemView, "lastTestStatus">[]) {
  const counts = { pass: 0, fail: 0, pending: 0 }
  for (const item of items) {
    const status = item.lastTestStatus
    if (status === "pass") counts.pass++
    else if (status === "fail" || status === "blocked") counts.fail++
    else if (status === "queued" || status === "running") counts.pending++
  }
  return counts
}

function statusLine(done: number, total: number, failing: number) {
  if (total === 0) return "No items yet"
  const base = `${done} of ${total} done`
  return failing > 0 ? `${base} · ${failing} failing` : base
}

type SummaryFacts = {
  slug: string
  title: string
  client: { name: string; slug: string }
  project: { name: string } | null
  effectiveStatus: "draft" | "open" | "done" | "void"
  progress: { done: number; total: number }
  failingTests: number
  sourceRef: string
  updatedAt: Date
}

/**
 * One shaper for both endpoints, so the row in the picker and the header on
 * the detail can never quote different numbers for the same list.
 */
function toSummary(facts: SummaryFacts): PunchlistWidgetSummary {
  const { done, total } = facts.progress
  return {
    slug: facts.slug,
    title: facts.title,
    client: facts.client.name,
    clientSlug: facts.client.slug,
    project: facts.project?.name ?? null,
    color: clientColor(facts.client.slug),
    status: facts.effectiveStatus,
    total,
    done,
    open: Math.max(total - done, 0),
    share: share(done, total),
    statusLine: statusLine(done, total, facts.failingTests),
    failingTests: facts.failingTests,
    sourceRef: facts.sourceRef,
    updatedAt: facts.updatedAt.toISOString(),
    href: ROUTES.punchlist(facts.slug),
  }
}

function summaryFromList(row: PunchlistSummary): PunchlistWidgetSummary {
  return toSummary({
    slug: row.slug,
    title: row.title,
    client: row.client,
    project: row.project,
    effectiveStatus: row.effectiveStatus,
    progress: row.progress,
    failingTests: row.testSummary.fail,
    sourceRef: row.sourceRef,
    updatedAt: row.updatedAt,
  })
}

function summaryFromView(list: PunchlistView): PunchlistWidgetSummary {
  return toSummary({
    slug: list.slug,
    title: list.title,
    client: list.client,
    project: list.project,
    effectiveStatus: list.effectiveStatus,
    progress: list.progress,
    failingTests: testCounts(list.items).fail,
    sourceRef: list.sourceRef,
    updatedAt: list.updatedAt,
  })
}

function toItem(item: ItemView, index: number, slug: string): PunchlistWidgetItem {
  const reported = cap(item.reported, REPORTED_CAP)
  const outcome = cap(item.outcome, OUTCOME_CAP)
  return {
    id: item.id,
    taskId: item.taskId,
    index,
    section: item.section,
    title: item.title,
    kind: item.kind,
    state: item.state,
    reported: reported.text,
    outcome: outcome.text,
    truncated: reported.cut || outcome.cut,
    testStatus: item.lastTestStatus,
    // The same peek the page opens, so tapping through lands on the item's
    // task rather than on the top of a 25-row list.
    href: item.taskId
      ? `${ROUTES.punchlist(slug)}?peek=task:${item.taskId}`
      : ROUTES.punchlist(slug),
  }
}

/* ------------------------------------------------------------------ memos */

const TTL_MS = 60_000

let indexMemo: { at: number; value: PunchlistIndexPayload } | null = null

/** Held un-sliced so two widgets asking for different `limit`s share one read. */
type DetailCache = Omit<PunchlistDetailPayload, "items" | "remaining" | "limit"> & {
  openItems: PunchlistWidgetItem[]
}
const detailMemo = new Map<string, { at: number; value: DetailCache | null }>()

function prune(now: number) {
  const stale: string[] = []
  detailMemo.forEach((entry, slug) => {
    if (now - entry.at >= TTL_MS) stale.push(slug)
  })
  for (const slug of stale) detailMemo.delete(slug)
}

/**
 * Drops both memos. Nothing calls this yet — a tick lands through
 * `POST /api/widget/complete/<taskId>`, which knows about tasks and not about
 * punch lists — but a caller that wants its own write reflected immediately
 * has somewhere to go that is not a stale-cache bug report.
 */
export function invalidateWidgetPunchlists() {
  indexMemo = null
  detailMemo.clear()
}

/* ------------------------------------------------------------------ index */

/**
 * Every open list, one summary each.
 *
 * `done` and `void` lists are left out: the widget is a worklist, and a list
 * with nothing left in it is not work. Drafts are out too — their items have
 * no tasks yet, so nothing on them could be ticked from a phone.
 *
 * Always answers, never 404s. An unconfigured widget and a genuinely quiet
 * week are the same call, and a 404 would make the picker look broken.
 */
export async function widgetPunchlists(now = new Date()): Promise<PunchlistIndexPayload> {
  if (indexMemo && now.getTime() - indexMemo.at < TTL_MS) return indexMemo.value

  await ensureClientColors()
  const rows = await listPunchlists()
  const open = rows.filter((row) => row.effectiveStatus === "open")

  const counts = open.reduce(
    (acc, row) => {
      acc.lists += 1
      acc.items += row.progress.total
      acc.done += row.progress.done
      acc.open += Math.max(row.progress.total - row.progress.done, 0)
      return acc
    },
    { lists: 0, items: 0, done: 0, open: 0 }
  )

  // Most left to do first, then the freshest — then one row per client before
  // any client repeats, so a client with four live lists cannot own the tile.
  const ranked = open
    .map((row) => ({
      summary: summaryFromList(row),
      groupKey: row.client.slug,
      remaining: Math.max(row.progress.total - row.progress.done, 0),
      updatedAt: row.updatedAt.getTime(),
    }))
    .sort(
      (a, b) =>
        b.remaining - a.remaining ||
        b.updatedAt - a.updatedAt ||
        a.summary.title.localeCompare(b.summary.title)
    )

  const ordered = roundRobinByClient(ranked)
  const value: PunchlistIndexPayload = {
    lists: ordered.slice(0, MAX_LISTS).map((row) => row.summary),
    counts,
    more: Math.max(ordered.length - MAX_LISTS, 0),
  }

  indexMemo = { at: now.getTime(), value }
  return value
}

/* ----------------------------------------------------------------- detail */

async function cachedDetail(slug: string, now: Date): Promise<DetailCache | null> {
  const at = now.getTime()
  const hit = detailMemo.get(slug)
  if (hit && at - hit.at < TTL_MS) return hit.value

  prune(at)
  await ensureClientColors()
  const list = await loadPunchlist(slug)
  if (!list) {
    // Misses are memoised too, so a widget left pointing at a deleted list
    // cannot walk the loader every fifteen minutes forever.
    detailMemo.set(slug, { at, value: null })
    return null
  }

  const counts = { todo: 0, doing: 0, waiting: 0, done: 0 }
  for (const item of list.items) counts[item.state] += 1

  // `loadPunchlist` already orders by (sectionSort, sort); the number an item
  // carries is its position in that order, matching the page's own numbering
  // so "07" on the phone is "07" in the browser.
  const openItems = list.items
    .map((item, i) => ({ item, index: i + 1 }))
    .filter(({ item }) => item.state !== "done")
    .map(({ item, index }) => toItem(item, index, list.slug))

  const value: DetailCache = {
    list: summaryFromView(list),
    intro: list.intro,
    counts,
    openItems,
  }
  detailMemo.set(slug, { at, value })
  return value
}

/**
 * One list's header plus its next open items, in filed order.
 *
 * Returns `null` only when there is no list with that slug — a done or void
 * list still answers, carrying its status, so a widget configured last month
 * can say "Done" instead of falling back to an error card.
 */
export async function widgetPunchlist(
  slug: string,
  options: { limit?: number } = {},
  now = new Date()
): Promise<PunchlistDetailPayload | null> {
  const cached = await cachedDetail(slug, now)
  if (!cached) return null

  const requested = options.limit ?? DEFAULT_ITEM_LIMIT
  const limit = Math.min(
    Math.max(Number.isFinite(requested) ? Math.trunc(requested) : DEFAULT_ITEM_LIMIT, 1),
    MAX_ITEM_LIMIT
  )

  return {
    list: cached.list,
    intro: cached.intro,
    counts: cached.counts,
    items: cached.openItems.slice(0, limit),
    remaining: Math.max(cached.openItems.length - limit, 0),
    limit,
  }
}
