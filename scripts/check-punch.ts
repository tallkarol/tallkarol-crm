/**
 * Sanity checks for the punch maths — timezone day boundaries, exact two-decimal
 * hours, the flags that block a one-tap approve, and the approval rule.
 * Run with `npx tsx scripts/check-punch.ts`.
 */

import {
  approvalBlocker,
  elapsedLabel,
  occurredOnIn,
  punchFlags,
  punchHours,
  punchMinutes,
  resolveInstant,
  wallClockIn,
} from "../lib/punch"

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}\n       got ${a}\n       want ${b}`)
  }
}

const TZ = "America/New_York"

console.log("\nhours — exact, two decimals, no rounding increment")
{
  const start = new Date("2026-08-27T13:41:00Z")
  check("23 minutes", punchHours(start, new Date("2026-08-27T14:04:00Z")), 0.38)
  check("73 minutes", punchHours(start, new Date("2026-08-27T14:54:00Z")), 1.22)
  check("49 minutes", punchHours(start, new Date("2026-08-27T14:30:00Z")), 0.82)
  check("backwards is zero", punchHours(start, new Date("2026-08-27T13:00:00Z")), 0)
  check("minutes", punchMinutes(start, new Date("2026-08-27T14:54:00Z")), 73)
  check("elapsed label", elapsedLabel(73), "1:13")
  check("elapsed label under an hour", elapsedLabel(23), "0:23")
}

console.log("\ntimezone — a punch belongs to the local day, not the UTC one")
{
  // 8:30 PM in New York on the 27th is already the 28th in UTC.
  const evening = new Date("2026-08-28T00:30:00Z")
  check("local day", occurredOnIn(evening, TZ), "2026-08-27")
  check("utc day differs", evening.toISOString().slice(0, 10), "2026-08-28")
  check("wall clock", wallClockIn(evening, TZ), "8:30 PM")
  check(
    "midnight reads as 12 AM",
    wallClockIn(new Date("2026-08-28T04:00:00Z"), TZ),
    "12:00 AM"
  )
  check(
    "noon reads as 12 PM",
    wallClockIn(new Date("2026-08-27T16:00:00Z"), TZ),
    "12:00 PM"
  )
  check(
    "morning",
    wallClockIn(new Date("2026-08-27T13:41:00Z"), TZ),
    "9:41 AM"
  )
}

console.log("\nflags — what blocks a one-tap approve")
{
  const clean = {
    startedAt: new Date("2026-08-27T13:41:00Z"),
    endedAt: new Date("2026-08-27T14:54:00Z"),
    status: "stopped" as const,
  }
  check("clean punch", punchFlags(clean, TZ), [])
  check(
    "over eight hours",
    punchFlags(
      { ...clean, endedAt: new Date("2026-08-27T23:00:00Z") },
      TZ
    ),
    ["long"]
  )
  check(
    "forgot to clock out overnight",
    punchFlags(
      {
        startedAt: new Date("2026-08-28T03:03:00Z"),
        endedAt: new Date("2026-08-28T12:17:00Z"),
        status: "stopped",
      },
      TZ
    ),
    ["long", "crosses_midnight"]
  )
  check(
    "still running since yesterday",
    punchFlags(
      { startedAt: new Date("2026-08-26T13:00:00Z"), endedAt: null, status: "running" },
      TZ,
      new Date("2026-08-27T13:00:00Z")
    ),
    ["stale"]
  )
  check(
    "running and fine",
    punchFlags(
      { startedAt: new Date("2026-08-27T12:00:00Z"), endedAt: null, status: "running" },
      TZ,
      new Date("2026-08-27T13:00:00Z")
    ),
    []
  )
}

console.log("\napproval rule — client always, summary when no project")
{
  check(
    "project, no summary — fine",
    approvalBlocker({ clientId: "c", projectId: "p", summary: "", hours: 1.22 }),
    null
  )
  check(
    "no project, no summary — blocked",
    approvalBlocker({ clientId: "c", projectId: null, summary: "  ", hours: 1.22 }),
    "No project on this one — write a summary so the invoice line reads."
  )
  check(
    "no project but a summary — fine",
    approvalBlocker({
      clientId: "c",
      projectId: null,
      summary: "redirect map QA",
      hours: 0.38,
    }),
    null
  )
  check(
    "no client — blocked",
    approvalBlocker({ clientId: null, projectId: "p", summary: "x", hours: 1 }),
    "Pick a client before approving."
  )
  check(
    "zero hours — blocked",
    approvalBlocker({ clientId: "c", projectId: "p", summary: "x", hours: 0 }),
    "Hours must be more than zero."
  )
}

console.log("\noffline sync — `at` is clamped so a bad device clock cannot drift")
{
  const now = new Date("2026-08-27T13:00:00Z")
  const twentyMinsAgo = "2026-08-27T12:40:00Z"
  const result = resolveInstant(twentyMinsAgo, now)
  check(
    "twenty minutes ago is accepted",
    "at" in result ? result.at.toISOString() : result,
    "2026-08-27T12:40:00.000Z"
  )
  check(
    "two days ago is refused",
    resolveInstant("2026-08-25T12:40:00Z", now),
    { error: "`at` must be within 24 hours of now." }
  )
  check("garbage is refused", resolveInstant("yesterday", now), {
    error: "`at` must be an ISO timestamp.",
  })
  check(
    "omitted means now",
    "at" in resolveInstant(undefined, now)
      ? (resolveInstant(undefined, now) as { at: Date }).at.toISOString()
      : null,
    "2026-08-27T13:00:00.000Z"
  )
}

console.log(
  failures === 0
    ? "\nAll punch checks passed.\n"
    : `\n${failures} check(s) failed.\n`
)
process.exit(failures === 0 ? 0 : 1)
