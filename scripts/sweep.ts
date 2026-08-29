/**
 * The sweeper, runnable by hand. In production this is Railway cron hitting
 * /api/monitors/sweep on the CRM service; locally this does the same work.
 *
 *   npm run monitors:sweep
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { sweepMonitors } from "../lib/monitors"

sweepMonitors()
  .then((result) => {
    console.log(`Checked ${result.checked} monitors.`)
    for (const r of result.raised) {
      console.log(`  ${r.monitor}: ${r.action}${r.ticketId ? ` → ${r.ticketId}` : ""}`)
    }
    if (!result.raised.length) console.log("  Nothing overdue.")
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
