/**
 * The scheduled tick, runnable by hand. In production this is the Railway cron
 * service; locally this does the same work.
 *
 *   npm run cron:tick
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { tick } from "../lib/tick"

tick()
  .then(({ reopened, sweep }) => {
    console.log(`Reopened ${reopened} repeating task${reopened === 1 ? "" : "s"}.`)
    console.log(
      `Checked ${sweep.checked} of ${sweep.monitors} monitors (the rest aren't due yet).`
    )
    for (const r of sweep.raised) {
      console.log(`  ${r.monitor}: ${r.action}${r.ticketId ? ` → ${r.ticketId}` : ""}`)
    }
    if (!sweep.raised.length) console.log("  Nothing overdue.")
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
