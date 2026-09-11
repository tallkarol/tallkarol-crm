import {
  DOMINATED_FOR_CODE,
  LADDERS,
  MODELS,
  breakEven,
  laddered,
  laddersAreSound,
  type ModelKey,
} from "@/lib/chat/models"
import { deskFor, monogram } from "@/lib/chat/desk-context"
import { allowed, insertLine, renderLine } from "@/lib/chat/pack-lines"
import { BRIEF_PREFIX, TITLE_MAX, solveBranch, taskBrief } from "@/lib/chat/task-brief"

/**
 * Guards the routing table.
 *
 *   npm run check:chat
 *
 * A ladder is only worth having when the cheap rung wins often enough to pay
 * for the retry. That is arithmetic, so it should not survive as a claim in a
 * comment — this fails the moment someone adds a rung that loses money, or
 * puts a model in a ladder that something cheaper already beats outright.
 */

let failed = false

function fail(message: string) {
  failed = true
  console.error(`✗ ${message}`)
}

/* 1. Every ladder pair must clear its break-even. */
const unsound = laddersAreSound()
for (const problem of unsound) fail(`${problem.job}: ${problem.problem}`)
if (unsound.length === 0) console.log("✓ every ladder pair beats going straight to the top rung")

/* 2. Dominated models must not appear in any CODE ladder. Writing is exempt:
      prose is not scored by CursorBench and the ranking does not apply. */
const codeJobs = new Set(["trivial_edit", "build_fix", "code_tested", "debug", "task"])
for (const ladder of Object.values(LADDERS)) {
  if (!codeJobs.has(ladder.job)) continue
  for (const rung of ladder.rungs) {
    if (DOMINATED_FOR_CODE.includes(rung)) {
      fail(
        `${ladder.job} uses ${MODELS[rung].label}, which is beaten on both score and price by a Cursor-pool model.`
      )
    }
  }
}

/* 3. Rungs must get more expensive as they climb. A ladder that steps down
      is a routing bug wearing a ladder's clothes. */
for (const ladder of Object.values(LADDERS)) {
  for (let i = 0; i < ladder.rungs.length - 1; i++) {
    const a = MODELS[ladder.rungs[i]].bench
    const b = MODELS[ladder.rungs[i + 1]].bench
    if (a && b && b.costPerTask <= a.costPerTask) {
      fail(
        `${ladder.job}: ${MODELS[ladder.rungs[i + 1]].label} is not dearer than ${MODELS[ladder.rungs[i]].label}.`
      )
    }
  }
}

/* 4. A ladder cannot promise more escalations than it has rungs. */
for (const ladder of Object.values(LADDERS)) {
  if (ladder.maxEscalations > ladder.rungs.length - 1) {
    fail(
      `${ladder.job}: allows ${ladder.maxEscalations} escalations but has ${ladder.rungs.length} rungs.`
    )
  }
  if (ladder.maxEscalations > 0 && !ladder.detector) {
    fail(`${ladder.job}: escalates with no detector to justify it.`)
  }
}

/* 5. The task brief's first line IS the thread title, so it has to fit the
      title cut; the rest has to say only what the task actually has. */
const brief = taskBrief({
  id: "0b8f3c1e-5d2a-4f61-9c0e-7a3b2d1e0f9a",
  title: "x".repeat(200),
  notes: "   ",
  labels: [],
  dueOn: null,
  priority: 1,
  boardStage: "queue",
  status: "open",
  cadence: "none",
  source: "manual",
  client: null,
  project: null,
  product: null,
  retainer: null,
  deliverable: null,
  checklist: [
    { title: "first", done: true },
    { title: "second", done: false },
  ],
  punchlist: null,
  url: "/tasks/0b8f3c1e-5d2a-4f61-9c0e-7a3b2d1e0f9a",
})
const [head] = brief.split("\n")
if (!head.startsWith(BRIEF_PREFIX)) fail(`brief does not open with "${BRIEF_PREFIX}"`)
if (head.length > TITLE_MAX) fail(`brief's first line is ${head.length} chars; the title cut is ${TITLE_MAX}`)
if (!brief.includes("Client: none (house task)")) fail("brief hides that the task has no client")
if (!brief.includes("[x] first") || !brief.includes("[ ] second")) fail("brief drops the checklist marks")
if (brief.includes("Notes:")) fail("brief prints an empty Notes section")
if (!brief.includes("CRM: /tasks/0b8f3c1e")) fail("brief lost the CRM link")
if (LADDERS.task.rungs.length !== 1 || LADDERS.task.maxEscalations !== 0) {
  fail("task ladder grew a rung without a detector to justify it")
}
if (LADDERS.persona.rungs.length !== 1 || LADDERS.persona.maxEscalations !== 0) {
  fail("persona ladder grew a rung without a detector to justify it")
}
if (solveBranch("0b8f3c1e-5d2a-4f61-9c0e-7a3b2d1e0f9a") !== "solve/0b8f3c1e") {
  fail("solveBranch is not solve/<first 8 of the task id>")
}
console.log("✓ task brief fits the title cut and says only what the task has")

/* 6. A pack line lands where the template says, once, and nowhere the desk
      may not write. The fixtures are the packs repo's own templates. */
const REL = [
  "# Zemvelo — relationship",
  "",
  "## PRIORITIES",
  "",
  "| Since | Priority | Source |",
  "|---|---|---|",
  "| | | |",
  "",
  "## PEOPLE",
  "",
  "| Name | Role | How they work with Karol |",
  "|---|---|---|",
  "| | | |",
  "",
  "## PROMISES",
  "",
  "What Karol said he would do.",
  "",
  "| Date | Promise | Due | Status | Source |",
  "|---|---|---|---|---|",
  "| | | | | |",
  "",
  "## HISTORY",
  "",
  "Dated lines: meetings, decisions, turning points. One line each.",
  "",
  "- YYYY-MM-DD —",
  "",
  "## PREFERENCES",
  "",
  "How they like to be communicated with.",
  "",
  "## OPEN",
  "",
  "What is unresolved between us, one line each, dated.",
  "",
].join("\n")
const DEC = [
  "# Momentum — decisions",
  "",
  "Newest first.",
  "",
  "| Date | Decision | Why | Rules out | Source |",
  "|---|---|---|---|---|",
  "| | | | | |",
  "",
].join("\n")
const META = { date: "2026-09-10", source: "chat:17bf15c4", marker: "<!-- crm:k1 -->" }

const promise = renderLine("promise", { promise: "send the proposal", due: "2026-09-12" }, META)
const withPromise = insertLine(REL, promise, META.marker)
const promisesBlock = withPromise.text.split("## PROMISES")[1].split("## HISTORY")[0]
if (!withPromise.changed || !promisesBlock.includes("| 2026-09-10 | send the proposal | 2026-09-12 | open | chat:17bf15c4 <!-- crm:k1 --> |")) {
  fail("a promise row did not land in the PROMISES table")
}
if (promisesBlock.includes("| | | | | |")) fail("the PROMISES placeholder row survived the first real row")
if (!withPromise.text.split("## PEOPLE")[1].split("## PROMISES")[0].includes("| | | |")) {
  fail("landing a promise touched the PEOPLE placeholder")
}
const again = insertLine(withPromise.text, promise, META.marker)
if (again.changed || again.text !== withPromise.text) fail("a second insert with the same marker was not a no-op")

const d1 = renderLine("decision", { decision: "free tier stays", why: "acquisition" }, { ...META, marker: "<!-- crm:d1 -->" })
const d2 = renderLine("decision", { decision: "no annual plan yet", why: "churn unknown", rulesOut: "annual pricing" }, { ...META, marker: "<!-- crm:d2 -->" })
const decided = insertLine(insertLine(DEC, d1, "<!-- crm:d1 -->").text, d2, "<!-- crm:d2 -->").text
const rows = decided.split("\n").filter((l) => l.startsWith("| 2026"))
if (rows.length !== 2 || !rows[0].includes("no annual plan yet") || !rows[1].includes("free tier stays")) {
  fail("decisions do not land newest-first under the separator")
}
if (decided.includes("| | | | | |")) fail("the decisions placeholder row survived")

const history = renderLine("history", { line: "kickoff call, they want the launch before the trade show" }, { ...META, marker: "<!-- crm:h1 -->" })
const withHistory = insertLine(withPromise.text, history, "<!-- crm:h1 -->").text
const historyBlock = withHistory.split("## HISTORY")[1].split("## PREFERENCES")[0]
if (!historyBlock.includes("- 2026-09-10 — kickoff call, they want the launch before the trade show <!-- crm:h1 -->")) {
  fail("a history line did not land under HISTORY")
}
if (historyBlock.includes("YYYY-MM-DD —")) fail("the HISTORY placeholder survived")
if (!/<!-- crm:h1 -->\n\n## PREFERENCES/.test(withHistory)) fail("the blank line before the next heading was lost")

const open = renderLine("open", { line: "who owns the DNS" }, { ...META, marker: "<!-- crm:o1 -->" })
const withOpen = insertLine(withHistory, open, "<!-- crm:o1 -->").text
if (!/one line each, dated\.\n\n- 2026-09-10 — who owns the DNS <!-- crm:o1 -->\n$/.test(withOpen)) {
  fail("an OPEN line under prose did not keep one blank line before the list")
}

const journal = renderLine("journal", { line: "wants to run three mornings a week" }, META)
const fresh = insertLine("", journal, META.marker).text
if (fresh !== "# 2026-09-10\n\n- wants to run three mornings a week <!-- crm:k1 -->\n") fail("a first journal line did not create the day's file")
const second = insertLine(fresh, renderLine("journal", { line: "second" }, { ...META, marker: "<!-- crm:k2 -->" }), "<!-- crm:k2 -->").text
if (!second.endsWith("- second <!-- crm:k2 -->\n") || !second.startsWith("# 2026-09-10")) fail("a second journal line did not append")
if (journal.file !== "journal/2026-09-10.md") fail(`journal file is ${journal.file}`)

let threw = false
try {
  insertLine("# nothing here\n", promise, META.marker)
} catch {
  threw = true
}
if (!threw) fail("a missing section was guessed instead of refused")

if (!allowed("coach", "me", "journal")) fail("coach may not journal in me")
if (allowed("coach", "clients/zemvelo", "journal")) fail("coach could write a client pack")
if (allowed("client-manager", "clients/zemvelo", "decision")) fail("client manager could write a decision")
if (!allowed("client-manager", "clients/zemvelo", "promise")) fail("client manager may not promise")
if (!allowed("product-owner", "products/momentum", "decision")) fail("product owner may not decide")
if (allowed("pm", "clients/zemvelo", "history")) fail("pm can write a pack line in v1")
if (renderLine("person", { name: "Ola | ops", role: "ops" }, META).markdown.split(/(?<!\\)\|/).length !== 5) {
  fail("a pipe in a cell broke the table")
}
console.log("✓ pack lines land under the right heading, once, and only for the desk that owns them")

/* 7. The dock fronts the right desk on the right page, and never the coach. */
const front = (path: string) => JSON.stringify(deskFor(path))
if (front("/clients/zemvelo") !== JSON.stringify({ agent: "client-manager", pack: "clients/zemvelo" })) fail("a client page does not front the client manager")
if (front("/clients/zemvelo/codebases/site") !== JSON.stringify({ agent: "developer", pack: "clients/zemvelo" })) fail("codebase docs do not front the developer")
if (front("/products/momentum") !== JSON.stringify({ agent: "product-owner", pack: "products/momentum" })) fail("a product page does not front the product owner")
if (front("/inspiration") !== JSON.stringify({ agent: "dreamer", pack: "" })) fail("the boards do not front the dreamer")
if (front("/") !== JSON.stringify({ agent: "pm", pack: "" })) fail("the dashboard does not front the pm")
if (deskFor("/chat") !== null || deskFor("/settings") !== null) fail("the dock fronts a desk on /chat or /settings")
if (Object.values(["/", "/clients/x", "/products/y", "/inspiration", "/reports"]).some((p) => deskFor(p)?.agent === "coach")) fail("the coach is a default somewhere")
if (monogram("client-manager") !== "CM" || monogram("pm") !== "PM" || monogram("coach") !== "CO") fail("monograms are off")
console.log("✓ the dock fronts the right desk per page")

/* Report the economics so a change to the table is legible in the diff. */
console.log("\nLadder economics (CursorBench 3.2 dollars per task)\n")
for (const ladder of Object.values(LADDERS)) {
  if (ladder.rungs.length < 2) {
    const only = MODELS[ladder.rungs[0]]
    console.log(
      `  ${ladder.label.padEnd(30)} ${only.label} only — ${ladder.note}`
    )
    continue
  }
  const cheap = ladder.rungs[0] as ModelKey
  const dear = ladder.rungs[ladder.rungs.length - 1] as ModelKey
  const need = breakEven(cheap, dear)
  const expected = laddered(cheap, dear)
  const straight = MODELS[dear].bench?.costPerTask
  if (need == null || expected == null || straight == null) continue
  const saving = ((1 - expected / straight) * 100).toFixed(0)
  console.log(
    `  ${ladder.label.padEnd(30)} $${expected.toFixed(2)} vs $${straight.toFixed(2)} straight — ${saving}% saved, needs ${(need * 100).toFixed(0)}% first-try`
  )
}

if (failed) {
  console.error("\ncheck:chat failed")
  process.exit(1)
}
console.log("\ncheck:chat passed")
