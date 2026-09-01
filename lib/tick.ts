import { reopenDueRecurring } from "@/lib/tasks"
import { sweepMonitors } from "@/lib/monitors"

/**
 * The clock work nothing else does.
 *
 * `reopenDueRecurring()` has only ever run inside the render path of the
 * dashboard and the task hub, so a weekly or monthly task stayed done until
 * someone opened the CRM in a browser. The widgets read without rendering
 * those pages, so without this they would show a finished monthly chore as
 * still finished into the next period.
 *
 * The monitor sweep rides along because it has the same problem: it has a
 * route and a script and has never been on a schedule.
 */
export async function tick(now = new Date()) {
  const reopened = await reopenDueRecurring(now)
  const sweep = await sweepMonitors(now)
  return { reopened, sweep }
}
