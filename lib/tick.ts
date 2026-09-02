import { reopenDueRecurring } from "@/lib/tasks"
import { sweepMonitors } from "@/lib/monitors"
import { notify } from "@/lib/notify"
import { sweepNotifications } from "@/lib/notification-sweep"
import { staleQueuedRuns } from "@/lib/punchlists"
import { sendBriefing, sweepSessionNotes } from "@/lib/leftoff-data"
import { localHourMinute } from "@/lib/leftoff"
import { workspaceTimezone } from "@/lib/timezone"
import { ROUTES } from "@/lib/nav"

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

  // A punch-list test nobody picked up: nudge once an hour, three times, then
  // leave it on the list where it is visible anyway.
  let nudged = 0
  const stale = await staleQueuedRuns(now, 60).catch(() => [])
  for (const run of stale) {
    const age = Math.floor((now.getTime() - run.requestedAt.getTime()) / 3_600_000)
    if (age < 1 || age > 3) continue
    const sent = await notify({
      kind: "punchlist.test",
      dedupeKey: `run:${run.id}:h${age}`,
      body: `Still waiting: ${run.item.title} — ${run.item.punchlist.title}`,
      url: `${ROUTES.punchlist(run.item.punchlist.slug)}?peek=run:${run.id}`,
      now,
    }).catch(() => "unsent" as const)
    if (sent === "sent") nudged += 1
  }

  // Where-I-left-off notes: presume a silent chat gone after a day, purge
  // hidden rows after two weeks. Pinned and hand-written notes are kept.
  const leftoff = await sweepSessionNotes(now).catch((err) => {
    console.error("leftoff sweep failed:", err)
    return { presumedGone: 0, purged: 0 }
  })

  // The morning briefing's fallback: if the Mac has not asked for it by
  // 07:30 (it asks on the first unlock), send it from here. The (kind, day)
  // dedupe means the two never both fire.
  let briefing: "sent" | "skipped" = "skipped"
  try {
    const { hour, minute } = localHourMinute(now, await workspaceTimezone())
    if (hour === 7 && minute >= 30) {
      const b = await sendBriefing(now)
      briefing = b.sent ? "sent" : "skipped"
    }
  } catch (err) {
    console.error("briefing failed:", err)
  }

  return { reopened, sweep, notifications, nudged, leftoff, briefing }
}
