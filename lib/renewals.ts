import { db } from "@/db"
import { tasks } from "@/db/schema"

const T_MINUS_DAYS = 30

/**
 * Windowed retainers get a renewal task at T-30 before ends_on. Runs lazily on
 * page load (same trick as monthly-task reopen) — no cron. Idempotent: the
 * task title carries the end date, so each window spawns exactly once, and a
 * checked-off task stays checked off.
 */
export async function ensureRenewalTasks(now = new Date()) {
  const retainers = await db.query.retainers.findMany()
  const due = retainers.filter((r) => {
    if (r.status !== "active" || !r.endsOn) return false
    const end = new Date(r.endsOn + "T00:00:00")
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000)
    return daysLeft <= T_MINUS_DAYS && daysLeft >= 0
  })
  if (due.length === 0) return

  const existing = await db.query.tasks.findMany()
  for (const r of due) {
    const endLabel = new Date(r.endsOn + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    const title = `Renew or wind down — ${r.name} ends ${endLabel}`
    // Matched on where it came from, not on its title: renaming one used to
    // spawn a twin on the next page load.
    const already = existing.some(
      (t) =>
        t.source === "renewal" &&
        t.refKind === "retainer" &&
        t.refId === r.id &&
        t.dueOn === r.endsOn
    )
    if (already) continue
    await db.insert(tasks).values({
      title,
      clientId: r.clientId,
      retainerId: r.id,
      dueOn: r.endsOn,
      source: "renewal",
      refKind: "retainer",
      refId: r.id,
      notes: `Auto-created at T-${T_MINUS_DAYS}. Decide before the window closes: renew, extend, or plan the handoff.`,
    })
  }
}
