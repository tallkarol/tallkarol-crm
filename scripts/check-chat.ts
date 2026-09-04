import {
  DOMINATED_FOR_CODE,
  LADDERS,
  MODELS,
  breakEven,
  laddered,
  laddersAreSound,
  type ModelKey,
} from "@/lib/chat/models"

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
const codeJobs = new Set(["trivial_edit", "build_fix", "code_tested", "debug"])
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
