/**
 * Checks for the decision queue — the kinds table, the approval rows that
 * were added to it, and the one agreement the queue has with an endpoint.
 *
 * Three things here fail silently in the UI rather than loudly:
 *
 * 1. A kind missing from `KIND_RANK`, `KIND_LABEL` or `BAND_OF_KIND` sorts as
 *    `undefined` and lands in no band. The row simply never appears.
 * 2. A name in `CONFIRM_FROM_STRIP` that no longer matches a tool leaves a
 *    Confirm button that is never offered — the safest possible failure, and
 *    therefore the one nobody would notice for months.
 * 3. `approve` sent as the string `"false"` reading as a Confirm. That one is
 *    not silent, it is the opposite of silent, and it only shows up after it
 *    has filed a write you were refusing.
 *
 * Run with `npm run check:waiting`.
 */

import {
  approvalLine,
  approveFromBody,
  BAND_OF_KIND,
  buildWaiting,
  emptyCounts,
  KIND_LABEL,
  KIND_RANK,
  WAITING_BANDS,
  WAITING_KINDS,
  WAITING_RULES,
  type ApprovalFacts,
  type WaitingFacts,
} from "../lib/waiting"
import { CONFIRM_FROM_STRIP, confirmsFromStrip } from "../lib/chat/tool-helpers"

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

const NOW = new Date("2026-09-22T10:00:00.000Z")
const HOUR = 3_600_000

function hoursAgo(n: number) {
  return new Date(NOW.getTime() - n * HOUR)
}

const CLIENT = { slug: "mineralife", name: "Mineralife", color: "#2f6f6b" }

function approval(over: Partial<ApprovalFacts> = {}): ApprovalFacts {
  return {
    callId: "call-1",
    tool: "log_time",
    action: "Time entry",
    subject: "Mineralife",
    thread: "Coach",
    canConfirm: true,
    parkedAt: hoursAgo(1),
    client: CLIENT,
    href: "/chat?thread=t1",
    ...over,
  }
}

function facts(over: Partial<WaitingFacts> = {}): WaitingFacts {
  return {
    chats: [],
    sessions: [],
    punchItems: [],
    tickets: [],
    overdueTasks: [],
    monitors: [],
    inquiries: [],
    approvals: [],
    ...over,
  }
}

/* --------------------------------------------------------- the kind tables */

console.log("\nKinds are total")
{
  const missingRank = WAITING_KINDS.filter((k) => typeof KIND_RANK[k] !== "number")
  const missingLabel = WAITING_KINDS.filter((k) => !KIND_LABEL[k])
  const missingBand = WAITING_KINDS.filter((k) => !WAITING_BANDS.includes(BAND_OF_KIND[k]))
  check("every kind has a rank", missingRank, [])
  check("every kind has a label", missingLabel, [])
  check("every kind has a real band", missingBand, [])

  const ranks = WAITING_KINDS.map((k) => KIND_RANK[k])
  check("ranks are unique", new Set(ranks).size, WAITING_KINDS.length)
  check("emptyCounts covers every kind", Object.keys(emptyCounts()).length, WAITING_KINDS.length)

  check("an approval is a decision, not a reply", BAND_OF_KIND.agent_approval, "decide")
}

/* ------------------------------------------------------- the allow-list */

console.log("\nThe strip allow-list")
{
  // The registry is imported lazily and only for this check: `lib/chat/tools.ts`
  // pulls the whole tool graph, and the rest of this file is pure.
  const mutating = new Set<string>()
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TOOLS } = require("../lib/chat/tools") as {
      TOOLS: readonly { name: string; mutating: boolean }[]
    }
    for (const tool of TOOLS) if (tool.mutating) mutating.add(tool.name)
  } catch (err) {
    failures += 1
    console.log(`  FAIL could not load the tool registry\n       ${String(err)}`)
  }

  if (mutating.size > 0) {
    const unknown = CONFIRM_FROM_STRIP.filter((name) => !mutating.has(name))
    check("every allowed name is a real mutating tool", unknown, [])
    check("the list is not empty", CONFIRM_FROM_STRIP.length > 0, true)
    check("no duplicates", new Set(CONFIRM_FROM_STRIP).size, CONFIRM_FROM_STRIP.length)

    // The four that must never be confirmable from one line. Named rather than
    // derived, so widening the allow-list has to argue with this list first.
    for (const name of ["edit_punch", "split_punch", "drop_punch", "approve_punch"]) {
      check(`${name} is never confirmed blind`, confirmsFromStrip(name), false)
    }
    check("propose_pack_line is never confirmed blind", confirmsFromStrip("propose_pack_line"), false)
    check("create_calendar_event is never confirmed blind", confirmsFromStrip("create_calendar_event"), false)
    check("inbox_to_ticket is never confirmed blind", confirmsFromStrip("inbox_to_ticket"), false)
  }
}

/* ------------------------------------------------------------ the rows */

console.log("\nAn approval row")
{
  const payload = buildWaiting(facts({ approvals: [approval()] }), NOW)
  const row = payload.items[0]
  check("one row", payload.items.length, 1)
  check("id is kind:callId", row?.id, "agent_approval:call-1")
  check("the title is the action and its subject", row?.title, "Time entry: Mineralife")
  check("the client comes through", row?.client, "Mineralife")
  check("counted under its own kind", payload.counts.agent_approval, 1)
  check("the subtitle is where it is parked", row?.subtitle, "Parked in Coach")
  check(
    "confirm, discard, open",
    row?.verbs.map((v) => v.id),
    ["confirm", "reject", "open"]
  )
  check("confirm posts to the call", row?.verbs[0]?.post, "/api/chat/approvals/call-1")
  check("confirm sends approve true", row?.verbs[0]?.body, { approve: "true" })
  check("discard sends approve false", row?.verbs[1]?.body, { approve: "false" })
  check("neither verb needs typing", row?.verbs.slice(0, 2).every((v) => !v.needsText), true)
}

console.log("\nA write whose fields matter")
{
  const payload = buildWaiting(
    facts({
      approvals: [
        approval({ tool: "edit_punch", action: "Edit punch", subject: "Mineralife", canConfirm: false }),
      ],
    }),
    NOW
  )
  const row = payload.items[0]
  check("no confirm verb", row?.verbs.some((v) => v.id === "confirm"), false)
  check("discard is still offered", row?.verbs.some((v) => v.id === "reject"), true)
  check("and the row says why", row?.subtitle.includes("open it to read the fields"), true)
}

console.log("\nThe push and the row say the same thing")
{
  const facts_ = approval()
  const payload = buildWaiting(facts({ approvals: [facts_] }), NOW)
  check("one name, two surfaces", approvalLine(facts_), payload.items[0]?.title)
}

console.log("\nA preview that said less than usual")
{
  const noSubject = buildWaiting(facts({ approvals: [approval({ subject: "" })] }), NOW)
  check("no subject leaves the action alone", noSubject.items[0]?.title, "Time entry")

  const nothing = buildWaiting(facts({ approvals: [approval({ action: "", subject: "" })] }), NOW)
  check("no preview at all falls back to the tool", nothing.items[0]?.title, "Waiting to log time")

  const onlySubject = buildWaiting(facts({ approvals: [approval({ action: "" })] }), NOW)
  check(
    "a subject with no action still reads",
    onlySubject.items[0]?.title,
    "Waiting to log time: Mineralife"
  )
}

console.log("\nAge")
{
  const fresh = buildWaiting(facts({ approvals: [approval({ parkedAt: hoursAgo(1) })] }), NOW)
  check("an hour old is warn", fresh.items[0]?.severity, "warn")

  const overnight = buildWaiting(
    facts({ approvals: [approval({ parkedAt: hoursAgo(WAITING_RULES.approvalHotHours - 1) })] }),
    NOW
  )
  check("inside a day is still warn", overnight.items[0]?.severity, "warn")

  const missed = buildWaiting(
    facts({ approvals: [approval({ parkedAt: hoursAgo(WAITING_RULES.approvalHotHours + 1) })] }),
    NOW
  )
  check("past a day is hot", missed.items[0]?.severity, "hot")
  check("never quiet", missed.items[0]?.severity !== "quiet", true)
}

console.log("\nOrdering")
{
  const payload = buildWaiting(
    facts({
      approvals: [
        approval({ callId: "new", parkedAt: hoursAgo(1) }),
        approval({ callId: "old", parkedAt: hoursAgo(48) }),
      ],
      overdueTasks: [
        {
          id: "task-1",
          title: "Send the invoice",
          dueOn: "2026-09-01",
          daysOver: 21,
          overdueSince: new Date("2026-09-01T00:00:00.000Z"),
          client: CLIENT,
          href: "/",
        },
      ],
      inquiries: [
        {
          id: "inq-1",
          name: "A stranger",
          company: "",
          source: "site",
          createdAt: hoursAgo(2),
          href: "/",
        },
      ],
    }),
    NOW
  )
  check(
    "an enquiry outranks an approval, an approval outranks an overdue task",
    payload.items.map((i) => i.kind),
    ["new_inquiry", "agent_approval", "agent_approval", "overdue_task"]
  )
  check("and the missed one comes first", payload.items[1]?.id, "agent_approval:old")
}

/* --------------------------------------------------- reading the preview */

console.log("\nReading a stored preview")
{
  // Lazily required for the same reason as the registry above: the db half
  // imports postgres, and the rest of this file is pure.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readPreview } = require("../lib/waiting-data") as {
    readPreview: (v: unknown) => { action: string; subject: string }
  }

  check(
    "a task preview",
    readPreview({
      title: "Task preview",
      fields: [{ label: "Title", value: "Ring the accountant" }],
    }),
    { action: "Task", subject: "Ring the accountant" }
  )
  check(
    "a title that is already a verb keeps its words",
    readPreview({ title: "Complete task", fields: [{ label: "Task", value: "Send the invoice" }] }),
    { action: "Complete task", subject: "Send the invoice" }
  )
  check(
    "the em-dash the tools use for 'not set' is not a subject",
    readPreview({
      title: "Task preview",
      fields: [
        { label: "Title", value: "\u2014" },
        { label: "Client", value: "\u2014" },
        { label: "Due", value: "2026-09-15" },
      ],
    }),
    { action: "Task", subject: "2026-09-15" }
  )
  check(
    "every field empty leaves no subject",
    readPreview({ title: "Task preview", fields: [{ label: "Title", value: "\u2014" }] }),
    { action: "Task", subject: "" }
  )
  check("no preview at all", readPreview(null), { action: "", subject: "" })
  check("a preview that is not an object", readPreview("nope"), { action: "", subject: "" })
  check(
    "fields that are not a list",
    readPreview({ title: "Task preview", fields: "nope" }),
    { action: "Task", subject: "" }
  )
  check(
    "a field that is not an object",
    readPreview({ title: "Task preview", fields: [null, { label: "Title", value: "Fine" }] }),
    { action: "Task", subject: "Fine" }
  )
  check(
    "a numeric value is not a subject",
    readPreview({ title: "Inbox sync preview", fields: [{ label: "Fetched", value: 8 }] }),
    { action: "Inbox sync", subject: "" }
  )
}

/* ------------------------------------------------- the endpoint agreement */

console.log("\nReading `approve` off the wire")
{
  check("the strip's confirm", approveFromBody("true"), true)
  check("the strip's discard", approveFromBody("false"), false)
  check("a real boolean false", approveFromBody(false), false)
  check("a real boolean true", approveFromBody(true), true)
  check("zero as a string", approveFromBody("0"), false)
  check("zero as a number", approveFromBody(0), false)
  check("absent still means approve", approveFromBody(undefined), true)
  check("an empty body still means approve", approveFromBody(null), true)
}

console.log(
  failures === 0 ? "\nAll waiting checks passed.\n" : `\n${failures} check(s) failed.\n`
)
process.exit(failures === 0 ? 0 : 1)
