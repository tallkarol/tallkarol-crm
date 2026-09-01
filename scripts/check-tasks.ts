/**
 * Checks for the task grammar and the recurrence periods — the two pieces
 * where a quiet mistake would be invisible in the UI.
 * Run with `npm run check:tasks`.
 */

import { parseTaskInput, parseWhen, type ParseTarget } from "../lib/task-parse"
import { periodKey } from "../lib/task-view"

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}\n       got  ${a}\n       want ${b}`)
  }
}

const TARGETS: ParseTarget[] = [
  { clientId: "c-gdi", clientName: "GDI", clientSlug: "gdi", projectId: null, projectName: null },
  {
    clientId: "c-caps",
    clientName: "CAPS Fieldhouse",
    clientSlug: "caps-fieldhouse",
    projectId: null,
    projectName: null,
  },
  {
    clientId: "c-caps",
    clientName: "CAPS Fieldhouse",
    clientSlug: "caps-fieldhouse",
    projectId: "p-web",
    projectName: "CAPS Fieldhouse website",
  },
  {
    clientId: "c-caps",
    clientName: "CAPS Fieldhouse",
    clientSlug: "caps-fieldhouse",
    projectId: "p-acf",
    projectName: "ACF event system",
  },
  {
    clientId: "c-dqs",
    clientName: "DQS",
    clientSlug: "dqs",
    projectId: "p-dqs",
    projectName: "DQS / AXVOR / AIS",
  },
  {
    clientId: "c-sondry",
    clientName: "Sondry",
    clientSlug: "sondry",
    projectId: null,
    projectName: null,
    productId: "prod-spectra",
    productName: "Spectramotus",
  },
  {
    clientId: "c-sondry",
    clientName: "Sondry",
    clientSlug: "sondry",
    projectId: null,
    projectName: null,
    productId: "prod-jive",
    productName: "Jive",
  },
  {
    clientId: null,
    clientName: null,
    clientSlug: null,
    projectId: null,
    projectName: null,
    productId: "prod-daedalus",
    productName: "Daedalus",
  },
]

// A Tuesday, so weekday maths has somewhere to land.
const NOW = new Date(2026, 8, 1, 10, 0, 0) // 1 Sep 2026

console.log("\ntargets — the old parser matched one word, at the end only")
{
  const p = parseTaskInput("check the 404s @gdi", TARGETS, NOW)
  check("trailing @client", [p.title, p.target?.clientId], ["check the 404s", "c-gdi"])

  const mid = parseTaskInput("@gdi check the 404s", TARGETS, NOW)
  check("leading @client", [mid.title, mid.target?.clientId], ["check the 404s", "c-gdi"])

  const multi = parseTaskInput("chase images @caps fieldhouse", TARGETS, NOW)
  check(
    "multi-word client",
    [multi.title, multi.target?.clientId, multi.target?.projectId],
    ["chase images", "c-caps", null]
  )

  const proj = parseTaskInput("chase images @caps fieldhouse website", TARGETS, NOW)
  check(
    "project beats its own client",
    [proj.title, proj.target?.projectId],
    ["chase images", "p-web"]
  )

  const bare = parseTaskInput("start it @ACF event system", TARGETS, NOW)
  check("project named alone", [bare.title, bare.target?.projectId], ["start it", "p-acf"])

  const slug = parseTaskInput("@caps-fieldhouse tidy up", TARGETS, NOW)
  check("slug form", [slug.title, slug.target?.clientId], ["tidy up", "c-caps"])

  const punct = parseTaskInput("invoice it @DQS / AXVOR / AIS", TARGETS, NOW)
  check("punctuation in a project name", punct.target?.projectId, "p-dqs")

  const product = parseTaskInput("build the page @spectramotus", TARGETS, NOW)
  check(
    "product named alone",
    [product.title, product.target?.productId, product.target?.clientId],
    ["build the page", "prod-spectra", "c-sondry"]
  )

  const house = parseTaskInput("build the page @sondry jive", TARGETS, NOW)
  check(
    "house plus product",
    [house.title, house.target?.productId],
    ["build the page", "prod-jive"]
  )

  const solo = parseTaskInput("ship the pack @daedalus", TARGETS, NOW)
  check(
    "solo product has no client",
    [solo.title, solo.target?.productId, solo.target?.clientId],
    ["ship the pack", "prod-daedalus", null]
  )

  const miss = parseTaskInput("ping @nobody about it", TARGETS, NOW)
  check(
    "an unmatched target is reported, not swallowed",
    [miss.title, miss.target, miss.unresolved],
    ["ping @nobody about it", null, "nobody"]
  )
}

console.log("\ndates")
{
  check("!today", parseWhen("today", NOW)?.on, "2026-09-01")
  check("!tomorrow", parseWhen("tomorrow", NOW)?.on, "2026-09-02")
  check("!fri", parseWhen("fri", NOW)?.on, "2026-09-04")
  check("!tue is today when it is Tuesday", parseWhen("tue", NOW)?.on, "2026-09-01")
  check("!3d", parseWhen("3d", NOW)?.on, "2026-09-04")
  check("!2w", parseWhen("2w", NOW)?.on, "2026-09-15")
  check("!eom", parseWhen("eom", NOW)?.on, "2026-09-30")
  check("!31aug rolls to next year once past", parseWhen("31aug", NOW)?.on, "2027-08-31")
  check("!25dec", parseWhen("25dec", NOW)?.on, "2026-12-25")
  check("!2026-10-05", parseWhen("2026-10-05", NOW)?.on, "2026-10-05")
  check("nonsense is refused", parseWhen("whenever", NOW), null)
}

console.log("\nfull lines")
{
  const p = parseTaskInput(
    "chase the missing hero images @caps fieldhouse website !fri",
    TARGETS,
    NOW
  )
  check("title survives", p.title, "chase the missing hero images")
  check("target", p.target?.projectId, "p-web")
  check("due", p.dueOn, "2026-09-04")
  check("due label", p.dueLabel, "Friday")

  const rep = parseTaskInput("monthly hours @gdi *monthly", TARGETS, NOW)
  check("cadence", [rep.title, rep.cadence, rep.target?.clientId], ["monthly hours", "monthly", "c-gdi"])

  const sn = parseTaskInput("look at the redirects @gdi >1w", TARGETS, NOW)
  check("snooze is separate from due", [sn.dueOn, sn.snoozedUntil], [null, "2026-09-08"])

  const q = parseTaskInput("security sweep @gdi *quarterly !eom", TARGETS, NOW)
  check("quarterly", [q.cadence, q.dueOn], ["quarterly", "2026-09-30"])

  const keep = parseTaskInput("email bob@example.com the invoice", TARGETS, NOW)
  check("an email address is not a target", [keep.title, keep.target], [
    "email bob@example.com the invoice",
    null,
  ])

  const badDate = parseTaskInput("do the thing !someday", TARGETS, NOW)
  check("an unparsed ! stays in the title", [badDate.title, badDate.dueOn], [
    "do the thing !someday",
    null,
  ])
}

console.log("\nrecurrence periods — this is what weekly-means-monthly cost")
{
  const sep1 = new Date(2026, 8, 1)
  const sep5 = new Date(2026, 8, 5)
  const sep9 = new Date(2026, 8, 9)
  const oct1 = new Date(2026, 9, 1)

  check("weekly: same week is the same period", periodKey("weekly", sep1) === periodKey("weekly", sep5), true)
  check("weekly: next week differs", periodKey("weekly", sep1) === periodKey("weekly", sep9), false)
  check("monthly: same month", periodKey("monthly", sep1) === periodKey("monthly", sep9), true)
  check("monthly: next month differs", periodKey("monthly", sep1) === periodKey("monthly", oct1), false)
  check("quarterly key", periodKey("quarterly", sep1), "2026-Q3")
  check("quarterly: October is Q4", periodKey("quarterly", oct1), "2026-Q4")
  check("once has no period", periodKey("none", sep1), null)
  check("monthly key shape", periodKey("monthly", sep1), "2026-09")
  check("weekly key shape", periodKey("weekly", sep1), "2026-W36")
}

console.log(
  failures === 0 ? "\nAll task checks passed.\n" : `\n${failures} check(s) failed.\n`
)
process.exit(failures === 0 ? 0 : 1)
