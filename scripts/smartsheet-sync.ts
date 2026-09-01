/**
 * Both Smartsheets, pulled on the schedule. This is the same work the cron
 * endpoint does, runnable without an HTTP hop — so it can be either the start
 * command of a Railway cron service or something you run by hand.
 *
 *   npm run smartsheet:sync            — sync if this hour opens a slot
 *   npm run smartsheet:sync -- --force — sync regardless
 *   npm run smartsheet:sync -- --status — print the last run, sync nothing
 *
 * Railway cron skips a run while the previous one is still going and never
 * kills it, so this exits on its own the moment the work is done.
 */
import { loadLocalEnv } from "../lib/load-env"

async function main() {
  loadLocalEnv()
  const { getSyncState, runScheduledSync } = await import("../lib/smartsheet-run")
  const { SCHEDULE_NOTE, currentSlot } = await import("../lib/smartsheet-schedule")

  const args = process.argv.slice(2)
  const state = await getSyncState()
  console.log(`Schedule: ${SCHEDULE_NOTE}`)
  console.log(`Slot now: ${currentSlot(new Date())} | last synced slot: ${state.lastSlot ?? "never"}`)
  if (state.lastRunAt) {
    console.log(`Last run: ${state.lastRunAt} — ${state.lastOk ? "ok" : "FAILED"} — ${state.lastSummary}`)
  }
  if (args.includes("--status")) return 0

  const result = await runScheduledSync({ force: args.includes("--force") })
  if (!result.ran) {
    console.log(`Nothing to do — ${result.reason}.`)
    return 0
  }
  console.log(
    `Support: ${result.support?.ok ? `${result.support.synced} rows` : `FAILED — ${result.support?.error}`}`
  )
  console.log(
    `Tracker: ${result.tracker?.ok ? `${result.tracker.synced} projects` : `FAILED — ${result.tracker?.error}`}`
  )
  return result.ok ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
