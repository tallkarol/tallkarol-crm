/**
 * Pure checks for the Focus tray and the horizon board — no database.
 *
 *   npm run check:focus
 *
 * Covers: the showing/queue window in both modes, placement rules (slot,
 * queue, before-a-queue-note, front) including the overflow that pushes a
 * slot into the queue, renumbering, and the horizon each task lands in.
 */
import { FOCUS_MAX, placeInOrder, renumber, windowOf, dueLabelFor, paperFor, type FocusCard } from "../lib/focus"
import { bandBoard, horizonOf, weekEnd } from "../lib/horizon"
import type { HubTask } from "../lib/task-view"

let failed = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok    ${name}`)
  else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : " — " + JSON.stringify(detail)}`)
  }
}

function card(id: string, position: number): FocusCard {
  return {
    id, refKind: "task", refId: `t-${id}`, position, global: false, paper: "task", title: id, project: null, dueOn: null,
    dueLabel: null, overdue: false, checklist: null, steps: [], notes: "", href: "#", clientSlug: "x", clientName: "X",
  }
}

console.log("window")
{
  const cards = ["a", "b", "c", "d", "e"].map((id, i) => card(id, 4 - i)) // positions 4..0
  const three = windowOf(cards, "three")
  check("three shows the first three by position", three.showing.map((c) => c.id).join("") === "edc")
  check("three queues the rest in order", three.queue.map((c) => c.id).join("") === "ba")
  const one = windowOf(cards, "one")
  check("one shows only position 0", one.showing.map((c) => c.id).join("") === "e")
  check("one queues positions 1.. in order", one.queue.map((c) => c.id).join("") === "dcba")
  check("FOCUS_MAX", FOCUS_MAX.three === 3 && FOCUS_MAX.one === 1)
}

console.log("placement")
{
  const order = ["a", "b", "c", "d", "e"]
  check("front", placeInOrder(order, "d", { front: true }, "three").join("") === "dabce")
  check("slot 1 from the queue pushes c into the queue", placeInOrder(order, "e", { slot: 1 }, "three").join("") === "aebcd")
  check("slot index is clamped", placeInOrder(order, "e", { slot: 9 }, "three").join("") === "abcde")
  check("queue end", placeInOrder(order, "a", { queue: null }, "three").join("") === "bcdea")
  check("queue 0 = first queued spot (after the slots)", placeInOrder(order, "a", { queue: 0 }, "three").join("") === "bcdae")
  check("queue in one-mode counts from position 1", placeInOrder(order, "e", { queue: 0 }, "one").join("") === "aebcd")
  check("a new id can be placed", placeInOrder(order, "z", { slot: 0 }, "three").join("") === "zabcde")
  check("renumber", renumber(["x", "y"]).map((r) => `${r.id}${r.position}`).join("") === "x0y1")
}

console.log("labels + paper")
{
  check("today", dueLabelFor("2026-09-22", "2026-09-22") === "Today")
  check("tomorrow", dueLabelFor("2026-09-23", "2026-09-22") === "Tomorrow")
  check("this week = weekday", /^[A-Z][a-z]{2} \d+$/.test(dueLabelFor("2026-09-25", "2026-09-22") ?? ""))
  check("far = month day", /^[A-Z][a-z]{2} \d+$/.test(dueLabelFor("2026-10-06", "2026-09-22") ?? ""))
  check("punch source → punch paper", paperFor("task", null, "punchlist") === "punch")
  check("override wins", paperFor("task", "money", "punchlist") === "money")
  check("mail → note paper", paperFor("mail", null) === "note")
}

console.log("horizon")
{
  const base: HubTask = {
    id: "t", title: "t", notes: "", labels: [], status: "open", stage: "queue", cadence: "none", priority: 2, dueOn: null,
    snoozedUntil: null, completedAt: null, updatedAt: "2026-09-20T00:00:00Z", createdAt: "2026-09-20T00:00:00Z", source: "manual",
    clientId: null, clientName: null, clientSlug: null, projectId: null, projectName: null, projectSlug: null, productId: null,
    productName: null, productSlug: null, retainerId: null, retainerName: null, deliverableLabel: null, items: { total: 0, done: 0 },
    waitingDays: null, overdueDays: null, periodNote: null,
  }
  const today = "2026-09-22" // a Tuesday? no: Mon 22 Sep 2026
  check("weekEnd of Mon 22 Sep is Sun 27", weekEnd(today) === "2026-09-27", weekEnd(today))
  check("weekEnd of a Sunday is itself", weekEnd("2026-09-27") === "2026-09-27")
  check("no date → later", horizonOf(base, today) === "later")
  check("due this week → week", horizonOf({ ...base, dueOn: "2026-09-25" }, today) === "week")
  check("overdue → week", horizonOf({ ...base, dueOn: "2026-09-10" }, today) === "week")
  check("due next week → later", horizonOf({ ...base, dueOn: "2026-09-28" }, today) === "later")
  check("waiting stage → waiting", horizonOf({ ...base, stage: "waiting", dueOn: "2026-09-25" }, today) === "waiting")
  check("snoozed → waiting", horizonOf({ ...base, snoozedUntil: "2026-10-01" }, today) === "waiting")
  check("done 3 days ago → done", horizonOf({ ...base, status: "done", completedAt: "2026-09-19T10:00:00Z" }, today) === "done")
  check("done 10 days ago → off the board", horizonOf({ ...base, status: "done", completedAt: "2026-09-12T10:00:00Z" }, today) === null)
  const cols = bandBoard(
    [
      { ...base, id: "late", dueOn: "2026-09-10" },
      { ...base, id: "soon", dueOn: "2026-09-24" },
      { ...base, id: "none" },
      { ...base, id: "focused", dueOn: "2026-09-24" },
    ],
    today,
    new Set(["focused"])
  )
  check("overdue sorts before due", cols.week.map((t) => t.id).join(",") === "late,soon", cols.week.map((t) => t.id))
  check("focused tasks are excluded", !cols.week.some((t) => t.id === "focused"))
  check("undated lands in later", cols.later.map((t) => t.id).join(",") === "none")
}

if (failed) {
  console.log(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log("\nall focus checks passed")
