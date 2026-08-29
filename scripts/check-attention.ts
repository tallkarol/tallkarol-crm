/**
 * Checks for the attention rules — the thresholds that decide what lands in
 * the "Needs you" band. A quiet mistake here is invisible in the UI: a row
 * simply stops being flagged, and nothing looks broken.
 * Run with `npm run check:attention`.
 */

import {
  ATTENTION_RULES,
  daysUntil,
  projectAttention,
  projectBand,
  retainerAttention,
  retainerBand,
  type DeliverableFacts,
  type InvoiceFacts,
  type ProjectFacts,
  type RetainerFacts,
  type TicketFacts,
  type WorkstreamFacts,
} from "../lib/attention"

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

/** Fixed "today" so every threshold is deterministic. 29 Aug 2026. */
const NOW = new Date(2026, 7, 29, 12, 0, 0)
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function project(over: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    status: "in_progress",
    updatedAt: daysAgo(1),
    workstreams: [],
    deliverables: [],
    invoices: [],
    tickets: [],
    ...over,
  }
}

function retainer(over: Partial<RetainerFacts> = {}): RetainerFacts {
  return {
    status: "active",
    hoursPerMonth: 80,
    endsOn: null,
    hoursThisMonth: 20,
    invoicedThisMonth: false,
    invoices: [],
    tickets: [],
    hasRenewalTask: false,
    ...over,
  }
}

const keys = (flags: { key: string }[]) => flags.map((f) => f.key)

console.log("\nDates")
{
  check("daysUntil counts forward", daysUntil("2026-09-14", NOW), 16)
  check("daysUntil is 0 today", daysUntil("2026-08-29", NOW), 0)
  check("daysUntil goes negative", daysUntil("2026-08-27", NOW), -2)
  check("daysUntil rejects junk", daysUntil("not-a-date", NOW), null)
}

console.log("\nProject — deliverables")
{
  const done: DeliverableFacts = {
    label: "D1",
    title: "Foundation",
    status: "done",
    feeCents: 124800,
    dueOn: null,
  }
  check(
    "done + fee is flagged hot",
    projectAttention(project({ deliverables: [done] }), NOW).map((f) => [f.key, f.severity]),
    [["deliverable-uninvoiced", "hot"]]
  )
  check(
    "already invoiced is silent",
    keys(projectAttention(project({ deliverables: [{ ...done, status: "invoiced" }] }), NOW)),
    []
  )
  check(
    "done with no fee is silent",
    keys(projectAttention(project({ deliverables: [{ ...done, feeCents: null }] }), NOW)),
    []
  )
  check(
    "two uninvoiced roll into one flag",
    keys(
      projectAttention(
        project({ deliverables: [done, { ...done, label: "D2" }] }),
        NOW
      )
    ),
    ["deliverable-uninvoiced"]
  )
}

console.log("\nProject — due dates")
{
  const due = (dueOn: string): DeliverableFacts => ({
    label: "D2",
    title: "Go-live",
    status: "pending",
    feeCents: 124800,
    dueOn,
  })
  check(
    "inside the window warns",
    keys(projectAttention(project({ deliverables: [due("2026-09-10")] }), NOW)),
    ["deliverable-due:D2"]
  )
  check(
    "beyond the window is silent",
    keys(projectAttention(project({ deliverables: [due("2026-10-30")] }), NOW)),
    []
  )
  check(
    "past due is hot, not warn",
    projectAttention(project({ deliverables: [due("2026-08-20")] }), NOW).map((f) => f.severity),
    ["hot"]
  )
  check(
    "a paid deliverable never chases a date",
    keys(
      projectAttention(
        project({ deliverables: [{ ...due("2026-08-20"), status: "paid" }] }),
        NOW
      )
    ),
    []
  )
}

console.log("\nProject — workstreams")
{
  const w = (stage: WorkstreamFacts["stage"], days: number): WorkstreamFacts => ({
    title: "AIS v1",
    stage,
    updatedAt: daysAgo(days),
  })
  check(
    "review under the limit is silent",
    keys(
      projectAttention(
        project({ workstreams: [w("review", ATTENTION_RULES.reviewStaleDays - 1)] }),
        NOW
      )
    ),
    []
  )
  check(
    "review at the limit flags",
    keys(projectAttention(project({ workstreams: [w("review", ATTENTION_RULES.reviewStaleDays)] }), NOW)),
    ["workstream-stale:AIS v1"]
  )
  check(
    "feedback gets the longer leash",
    keys(projectAttention(project({ workstreams: [w("feedback", ATTENTION_RULES.reviewStaleDays)] }), NOW)),
    []
  )
  check(
    "building never goes stale",
    keys(projectAttention(project({ workstreams: [w("building", 90)] }), NOW)),
    []
  )
  check(
    "live never goes stale",
    keys(projectAttention(project({ workstreams: [w("live", 90)] }), NOW)),
    []
  )
}

console.log("\nProject — waiting on content")
{
  check(
    "fresh wait is silent",
    keys(projectAttention(project({ status: "waiting_on_content", updatedAt: daysAgo(3) }), NOW)),
    []
  )
  check(
    "long wait flags",
    keys(
      projectAttention(
        project({
          status: "waiting_on_content",
          updatedAt: daysAgo(ATTENTION_RULES.waitingOnContentDays),
        }),
        NOW
      )
    ),
    ["waiting-on-content"]
  )
}

console.log("\nInvoices")
{
  const draft = (issuedOn: string): InvoiceFacts => ({
    number: "GDI-2026-08",
    status: "draft",
    issuedOn,
    amountCents: 421500,
  })
  check(
    "a draft issuing soon is hot",
    keys(retainerAttention(retainer({ invoices: [draft("2026-08-31")] }), NOW)),
    ["invoice-draft:GDI-2026-08"]
  )
  check(
    "a draft issuing later is silent",
    keys(retainerAttention(retainer({ invoices: [draft("2026-09-30")] }), NOW)),
    []
  )
  check(
    "a sent invoice is never chased",
    keys(
      retainerAttention(
        retainer({ invoices: [{ ...draft("2026-08-01"), status: "sent" }] }),
        NOW
      )
    ),
    []
  )
}

console.log("\nRetainer — the month")
{
  check(
    "nothing logged late in the month is hot",
    retainerAttention(retainer({ hoursThisMonth: 0 }), NOW).map((f) => [f.key, f.severity]),
    [["retainer-quiet", "hot"]]
  )
  check(
    "nothing logged early in the month is fine",
    keys(retainerAttention(retainer({ hoursThisMonth: 0 }), new Date(2026, 7, 5))),
    []
  )
  check(
    "a paused retainer is not chased for hours",
    keys(retainerAttention(retainer({ hoursThisMonth: 0, status: "paused" }), NOW)),
    []
  )
  check(
    "near the ceiling warns",
    retainerAttention(retainer({ hoursThisMonth: 70.3 }), NOW).map((f) => [f.key, f.severity]),
    [["retainer-near-cap", "warn"]]
  )
  check(
    "over the ceiling is hot",
    retainerAttention(retainer({ hoursThisMonth: 84 }), NOW).map((f) => [f.key, f.severity]),
    [["retainer-over-cap", "hot"]]
  )
  check(
    "mid-range is silent",
    keys(retainerAttention(retainer({ hoursThisMonth: 40 }), NOW)),
    []
  )
}

console.log("\nRetainer — renewal")
{
  check(
    "renewal inside the window with no task is hot",
    retainerAttention(retainer({ endsOn: "2026-09-30" }), NOW).map((f) => [f.key, f.severity]),
    [["retainer-renewal", "hot"]]
  )
  check(
    "a filed renewal task softens it",
    retainerAttention(retainer({ endsOn: "2026-09-30", hasRenewalTask: true }), NOW).map(
      (f) => f.severity
    ),
    ["warn"]
  )
  check(
    "a far-off renewal is silent",
    keys(retainerAttention(retainer({ endsOn: "2026-12-31" }), NOW)),
    []
  )
}

console.log("\nTickets")
{
  const t = (over: Partial<TicketFacts>): TicketFacts => ({
    priority: "normal",
    ageDays: 1,
    answered: false,
    ...over,
  })
  check(
    "an urgent ticket is chased after a day",
    keys(retainerAttention(retainer({ tickets: [t({ priority: "urgent", ageDays: 1 })] }), NOW)),
    ["tickets-unanswered"]
  )
  check(
    "a low ticket is not chased at a week",
    keys(retainerAttention(retainer({ tickets: [t({ priority: "low", ageDays: 7 })] }), NOW)),
    []
  )
  check(
    "an answered ticket is never chased",
    keys(
      retainerAttention(
        retainer({ tickets: [t({ priority: "urgent", ageDays: 30, answered: true })] }),
        NOW
      )
    ),
    []
  )
  check(
    "the flag names the oldest",
    retainerAttention(
      retainer({
        tickets: [t({ priority: "high", ageDays: 18 }), t({ priority: "high", ageDays: 106 })],
      }),
      NOW
    )[0]?.short,
    "2 tickets unanswered, oldest 106d"
  )
}

console.log("\nBands")
{
  const clean = project({ workstreams: [{ title: "w", stage: "building", updatedAt: daysAgo(2) }] })
  check("a clean, recent project is moving", projectBand(clean, [], NOW), "moving")
  check(
    "a flagged project needs you",
    projectBand(clean, [{ key: "x", severity: "warn", short: "s", detail: "d" }], NOW),
    "needs-you"
  )
  check(
    "complete outranks a flag",
    projectBand(
      project({ status: "complete" }),
      [{ key: "x", severity: "hot", short: "s", detail: "d" }],
      NOW
    ),
    "closed"
  )
  check(
    "an untouched project goes quiet",
    projectBand(
      project({ workstreams: [{ title: "w", stage: "building", updatedAt: daysAgo(40) }] }),
      [],
      NOW
    ),
    "quiet"
  )
  check(
    "waiting on content is its own band",
    projectBand(project({ status: "waiting_on_content", updatedAt: daysAgo(2) }), [], NOW),
    "waiting"
  )
  check(
    "a retainer with hours is moving",
    retainerBand(retainer({ hoursThisMonth: 12 }), []),
    "moving"
  )
  check(
    "a retainer with none is quiet",
    retainerBand(retainer({ hoursThisMonth: 0 }), []),
    "quiet"
  )
  check("an ended retainer is closed", retainerBand(retainer({ status: "ended" }), []), "closed")
}

console.log("\nOrdering")
{
  const flags = projectAttention(
    project({
      deliverables: [
        { label: "D1", title: "Foundation", status: "done", feeCents: 124800, dueOn: null },
        { label: "D2", title: "Go-live", status: "pending", feeCents: 124800, dueOn: "2026-09-10" },
      ],
    }),
    NOW
  )
  check("hot sorts ahead of warn", flags[0]?.severity, "hot")
}

console.log(
  failures === 0 ? "\nAll attention checks passed.\n" : `\n${failures} check(s) failed.\n`
)
process.exit(failures === 0 ? 0 : 1)
