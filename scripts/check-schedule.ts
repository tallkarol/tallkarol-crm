/**
 * Checks for the Smartsheet sync schedule. The failure mode here is silent:
 * a slot that never matches simply stops syncing, and nothing looks broken
 * until a week of tracker changes is missing.
 * Run with `npm run check:schedule`.
 */

import { currentSlot, isDue, localParts } from "../lib/smartsheet-schedule"

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

/** UTC instants, so the conversion to Colorado is the thing under test. */
const utc = (iso: string) => new Date(iso)

console.log("\nClock conversion")
{
  // Mountain Daylight Time, UTC-6.
  check("14:00 UTC in summer is 8am", localParts(utc("2026-08-31T14:00:00Z")).hour, 8)
  check("18:00 UTC in summer is noon", localParts(utc("2026-08-31T18:00:00Z")).hour, 12)
  check("22:00 UTC in summer is 4pm", localParts(utc("2026-08-31T22:00:00Z")).hour, 16)
  // Mountain Standard Time, UTC-7 — the same wall clock, an hour later in UTC.
  check("15:00 UTC in winter is 8am", localParts(utc("2026-01-12T15:00:00Z")).hour, 8)
  check("19:00 UTC in winter is noon", localParts(utc("2026-01-12T19:00:00Z")).hour, 12)
  check("23:00 UTC in winter is 4pm", localParts(utc("2026-01-12T23:00:00Z")).hour, 16)
  // Late evening in Colorado is already tomorrow in UTC.
  check("04:00 UTC is the previous evening", localParts(utc("2026-09-01T04:00:00Z")).day, 31)
  check("and reads as 10pm", localParts(utc("2026-09-01T04:00:00Z")).hour, 22)
}

console.log("\nSlots on a weekday (Monday 31 August 2026)")
{
  check("before 8am holds yesterday's last slot", currentSlot(utc("2026-08-31T13:00:00Z")), "2026-08-30T12")
  check("8am opens the morning slot", currentSlot(utc("2026-08-31T14:00:00Z")), "2026-08-31T08")
  check("9am still reads as the 8am slot", currentSlot(utc("2026-08-31T15:00:00Z")), "2026-08-31T08")
  check("noon opens the midday slot", currentSlot(utc("2026-08-31T18:00:00Z")), "2026-08-31T12")
  check("4pm opens the afternoon slot", currentSlot(utc("2026-08-31T22:00:00Z")), "2026-08-31T16")
  check("11pm still reads as the 4pm slot", currentSlot(utc("2026-09-01T05:00:00Z")), "2026-08-31T16")
}

console.log("\nSlots at the weekend (Saturday 5 September 2026)")
{
  check("Saturday 8am is not a slot", currentSlot(utc("2026-09-05T14:00:00Z")), "2026-09-04T16")
  check("Saturday noon is", currentSlot(utc("2026-09-05T18:00:00Z")), "2026-09-05T12")
  check("Saturday 4pm is still noon's slot", currentSlot(utc("2026-09-05T22:00:00Z")), "2026-09-05T12")
  check("Sunday noon is its own slot", currentSlot(utc("2026-09-06T18:00:00Z")), "2026-09-06T12")
  check("Monday 8am reopens the weekday rhythm", currentSlot(utc("2026-09-07T14:00:00Z")), "2026-09-07T08")
}

console.log("\nFiring once per slot")
{
  const noon = utc("2026-08-31T18:00:00Z")
  check("due when the slot has not run", isDue(noon, "2026-08-31T08"), true)
  check("not due a second time in the same slot", isDue(noon, "2026-08-31T12"), false)
  check("due on a cold start", isDue(noon, null), true)
  // Railway may fire a few minutes early; the next hourly pass still catches it.
  check("an early fire is not a slot", currentSlot(utc("2026-08-31T17:57:00Z")), "2026-08-31T08")
  check("and the next hour picks it up", isDue(utc("2026-08-31T18:02:00Z"), "2026-08-31T08"), true)
  // A run missed entirely — a deploy over the noon hour — is caught later.
  check("a missed slot is caught at 1pm", isDue(utc("2026-08-31T19:00:00Z"), "2026-08-31T08"), true)
}

console.log("\nDaylight saving changeover")
{
  // Clocks go forward 8 March 2026, back 1 November 2026. Our slots are all
  // well clear of 2am, so none of them vanish or repeat.
  check("Friday before spring forward", currentSlot(utc("2026-03-06T15:00:00Z")), "2026-03-06T08")
  check("Monday after spring forward", currentSlot(utc("2026-03-09T14:00:00Z")), "2026-03-09T08")
  check("Friday before falling back", currentSlot(utc("2026-10-30T14:00:00Z")), "2026-10-30T08")
  check("Monday after falling back", currentSlot(utc("2026-11-02T15:00:00Z")), "2026-11-02T08")
  // Every hour of the changeover days maps to exactly one slot, so nothing
  // syncs twice and nothing is skipped.
  for (const day of ["2026-03-08", "2026-11-01"]) {
    const seen = new Set<string>()
    for (let h = 0; h < 24; h++) seen.add(currentSlot(utc(`${day}T${String(h).padStart(2, "0")}:00:00Z`)))
    check(`${day} produces no phantom slots`, seen.size <= 3, true)
  }
}

console.log("\nA full week of hourly wake-ups")
{
  // Seventeen slots in a week — five weekdays at three, two weekend days at
  // one — plus the slot already open when the window starts.
  let fired = 0
  let last: string | null = null
  const start = utc("2026-08-31T00:00:00Z") // Monday
  for (let h = 0; h < 24 * 7; h++) {
    const now = new Date(start.getTime() + h * 3600_000)
    if (isDue(now, last)) {
      fired += 1
      last = currentSlot(now)
    }
  }
  check("one sync per slot, 17 slots plus the one already open", fired, 18)
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failing check(s).\n`)
process.exit(failures === 0 ? 0 : 1)
