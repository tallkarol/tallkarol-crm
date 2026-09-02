/**
 * The punch-list maths that would fail silently: which task columns mean
 * which item state and what a click moves to, section grouping and the n/m
 * counters, the list-status roll-up, the test-spec contract, and the run
 * transitions. Run with npm run check:punchlist
 */

import {
  canTransition,
  groupBySection,
  itemState,
  listStatus,
  matchesState,
  NEXT_STATE,
  parseTestSpec,
  progress,
  slugify,
  stateToTask,
  type ItemView,
} from "../lib/punchlist"

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}\n  got  ${a}\n  want ${e}`)
  }
}

function item(over: Partial<ItemView>): ItemView {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    section: "",
    sectionSort: 0,
    sort: 0,
    title: "x",
    kind: "",
    reported: "",
    outcome: "",
    taskId: "t",
    state: "todo",
    test: null,
    lastTestStatus: "",
    ...over,
  }
}

console.log("item state ← task columns")
{
  check("no task = to do", itemState(null), "todo")
  check("open/queue = to do", itemState({ status: "open", boardStage: "queue" }), "todo")
  check("open/doing = doing", itemState({ status: "open", boardStage: "doing" }), "doing")
  check("open/waiting = waiting", itemState({ status: "open", boardStage: "waiting" }), "waiting")
  check("done wins over stage", itemState({ status: "done", boardStage: "doing" }), "done")
}

console.log("the click cycle")
{
  check("to do → doing", NEXT_STATE.todo, "doing")
  check("doing → done", NEXT_STATE.doing, "done")
  check("done → to do", NEXT_STATE.done, "todo")
  check("waiting → doing (never cycled into)", NEXT_STATE.waiting, "doing")
  check("done writes completeTask", stateToTask("done"), { done: true })
  check("doing writes stage", stateToTask("doing"), { done: false, stage: "doing" })
  check("to do reopens into queue", stateToTask("todo"), { done: false, stage: "queue" })
}

console.log("sections + counters")
{
  const rows = [
    item({ id: "1", section: "B · Code", sectionSort: 1, sort: 1, state: "done" }),
    item({ id: "2", section: "A · Answers", sectionSort: 0, sort: 0 }),
    item({ id: "3", section: "B · Code", sectionSort: 1, sort: 0, state: "doing" }),
    item({ id: "4", section: "A · Answers", sectionSort: 0, sort: 1, state: "done" }),
  ]
  const sections = groupBySection(rows)
  check("section order follows sectionSort", sections.map((s) => s.section), ["A · Answers", "B · Code"])
  check("items sorted within section", sections[1].items.map((i) => i.id), ["3", "1"])
  check("per-section n/m", sections.map((s) => `${s.done}/${s.total}`), ["1/2", "1/2"])
  check("progress", progress(rows), { done: 2, total: 4, pct: 50 })
  check("progress of nothing", progress([]), { done: 0, total: 0, pct: 0 })
  check("todo filter includes waiting", matchesState(item({ state: "waiting" }), "todo"), true)
  check("doing filter excludes waiting", matchesState(item({ state: "waiting" }), "doing"), false)
}

console.log("list status roll-up")
{
  check("draft stays draft", listStatus("draft", [item({ state: "done" })]), "draft")
  check("void stays void", listStatus("void", []), "void")
  check("open with all done reads done", listStatus("open", [item({ state: "done" })]), "done")
  check("done with one reopened reads open", listStatus("done", [item({ state: "done" }), item({})]), "open")
  check("open with no items stays open", listStatus("open", []), "open")
}

console.log("test spec")
{
  check("null clears", parseTestSpec(null), { ok: true, spec: null })
  check("manual needs only expect", parseTestSpec({ kind: "manual", expect: "looks right" }).ok, true)
  check("browser without url refused", parseTestSpec({ kind: "browser", expect: "x" }).ok, false)
  check("command without command refused", parseTestSpec({ kind: "command", expect: "x" }).ok, false)
  check("bad kind refused", parseTestSpec({ kind: "magic", expect: "x" }).ok, false)
  check("missing expect refused", parseTestSpec({ kind: "manual" }).ok, false)
  const full = parseTestSpec({
    kind: "browser",
    url: "https://example.com/doors",
    steps: ["open the page", "look at the gallery tab"],
    expect: "Doors tab is active",
    evidence: ["screenshot"],
    timeoutSec: 60,
  })
  check("full browser spec round-trips", full.ok && full.spec?.steps?.length, 2)
}

console.log("run transitions")
{
  check("queued → running", canTransition("queued", "running"), true)
  check("queued → pass allowed (a report may skip the claim)", canTransition("queued", "pass"), true)
  check("running → running is not a transition", canTransition("running", "running"), false)
  check("queued → queued is not a transition", canTransition("queued", "queued"), false)
  check("running → fail", canTransition("running", "fail"), true)
  check("pass is terminal", canTransition("pass", "running"), false)
  check("running → blocked", canTransition("running", "blocked"), true)
}

console.log("slugs")
{
  check("basic", slugify("UWD Preprod Punch List"), "uwd-preprod-punch-list")
  check("punctuation + accents", slugify("Pedro's hitlist — Août"), "pedro-s-hitlist-aout")
  check("empty", slugify("!!!"), "")
}

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
