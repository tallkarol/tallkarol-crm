import { reopenDueRecurring } from "@/lib/tasks"
import { sweepMonitors } from "@/lib/monitors"
import { notify } from "@/lib/notify"
import { sweepNotifications } from "@/lib/notification-sweep"

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

  // A monitor that raised a ticket is worth waking a phone for, quiet hours
  // or not — that is the one kind that ignores them.
  for (const raised of sweep.raised) {
    if (!raised.ticketId) continue
    await notify({
      kind: "ops.monitor",
      dedupeKey: raised.ticketId,
      body: `${raised.monitor}: ${raised.action}`,
      url: "/support",
      now,
    }).catch(() => {})
  }

  // Everything else the catalog knows about, evaluated from the same
  // endpoints the widgets and the Mac app read.
  const notifications = await sweepNotifications(now).catch((err) => {
    console.error("notification sweep failed:", err)
    return {}
  })

  return { reopened, sweep, notifications }
}
