import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { tasks } from "@/db/schema"
import { insertTaskRow } from "@/lib/task-insert"

const T_MINUS_DAYS = 30

/**
 * Windowed retainers get a renewal task at T-30 before ends_on. Runs lazily on
 * page load (same trick as monthly-task reopen) — no cron. Idempotent: matched
 * on where the task came from, not on its title, so renaming one no longer
 * spawns a twin on the next page load.
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

  // Only the renewal tasks for the retainers actually in the window. This used
  // to read the whole tasks table on every page that called it.
  const existing = await db.query.tasks.findMany({
    columns: { refId: true, dueOn: true },
    where: and(
      eq(tasks.source, "renewal"),
      eq(tasks.refKind, "retainer"),
      inArray(
        tasks.refId,
        due.map((r) => r.id)
      )
    ),
  })
  const already = new Set(existing.map((t) => `${t.refId}|${t.dueOn}`))

  for (const r of due) {
    if (already.has(`${r.id}|${r.endsOn}`)) continue
    const endLabel = new Date(r.endsOn + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    await insertTaskRow(db, {
      title: `Renew or wind down — ${r.name} ends ${endLabel}`,
      userId: null,
      // Named outright rather than resolved: the task belongs to the retainer
      // that is ending, which is not necessarily the client's active one.
      target: {
        clientId: r.clientId,
        projectId: null,
        productId: null,
        retainerId: r.id,
        deliverableId: null,
      },
      dueOn: r.endsOn,
      source: "renewal",
      refKind: "retainer",
      refId: r.id,
      notes: `Auto-created at T-${T_MINUS_DAYS}. Decide before the window closes: renew, extend, or plan the handoff.`,
    })
  }
}
