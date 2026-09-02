import { occurredOnIn } from "@/lib/punch"
import { workspaceTimezone } from "@/lib/timezone"
import { widgetAttention, widgetTasks, widgetTickets } from "@/lib/widget"
import { widgetUserId } from "@/lib/widget-auth"
import { widgetClock } from "@/lib/widget-clock"
import {
  getNotificationPrefs,
  notify,
  recordSeeded,
  setNotificationPrefs,
  type NotificationKind,
  type NotifyResult,
} from "@/lib/notify"

/**
 * The server-side evaluation of the catalog — the same rules the Mac app
 * runs against the same endpoints, so a phone and a laptop agree about what
 * happened. Runs inside the cron tick, every fifteen minutes.
 */

export type SweepReport = Partial<Record<NotifyResult, number>> & { seeded?: number }

function localHourAndWeekday(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", hour12: false, weekday: "short", timeZone: tz,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon"
  return { hour, isWeekday: !["Sat", "Sun"].includes(weekday) }
}

export async function sweepNotifications(now = new Date()): Promise<SweepReport> {
  const userId = await widgetUserId()
  if (!userId) return {}

  const tz = await workspaceTimezone()
  const today = occurredOnIn(now, tz)
  const { hour, isWeekday } = localHourAndWeekday(now, tz)

  const [clock, tasks, tickets, attention, prefs] = await Promise.all([
    widgetClock(userId, now),
    widgetTasks(now),
    widgetTickets(now),
    widgetAttention(now),
    getNotificationPrefs(),
  ])

  // Everything worth saying, as (kind, key, body, url).
  const candidates: { kind: NotificationKind; key: string; body: string; url: string }[] = []

  for (const t of tickets.tickets) {
    candidates.push({
      kind: "ticket.new", key: t.id,
      body: `${t.client ?? "No client"} · ${t.title}`, url: t.href,
    })
  }
  for (const f of attention.flags) {
    candidates.push({
      kind: f.severity === "hot" ? "flag.hot" : "flag.warn", key: f.key,
      body: `${f.short} · ${f.clients.join(", ") || "No client"}`, url: f.href ?? "/delivery",
    })
  }
  for (const t of tasks.tasks) {
    if (t.badgeTone === "hot") {
      candidates.push({ kind: "task.overdue", key: t.id, body: `${t.title} · ${t.context}`, url: t.href })
    }
  }
  if (hour >= 8) {
    const due = tasks.tasks.filter((t) => t.dueOn === today)
    if (due.length > 0) {
      const body = due.length === 1
        ? due[0].title
        : `${due.length} tasks: ` + due.slice(0, 3).map((t) => t.title).join(" · ")
      candidates.push({ kind: "task.due", key: today, body, url: "/tasks" })
    }
  }
  for (const p of clock.runningPunches) {
    if (p.flags.includes("long")) {
      candidates.push({
        kind: "clock.long", key: p.id,
        body: `${p.projectName ?? p.clientName} has been running since ${p.startClock}.`,
        url: "/timesheet/live",
      })
    }
  }
  if (hour >= 11 && isWeekday && clock.runningPunches.length === 0 && clock.today.hours === 0) {
    candidates.push({ kind: "clock.idle", key: today, body: "Nothing on the clock yet today.", url: "/timesheet/live" })
  }

  // First run after deploy: remember, don't announce.
  if (!prefs.seeded) {
    for (const c of candidates) await recordSeeded(c.kind, c.key, now)
    await setNotificationPrefs({ seeded: true })
    return { seeded: candidates.length }
  }

  const report: SweepReport = {}
  for (const c of candidates) {
    const result = await notify({ ...c, dedupeKey: c.key, userId, now })
    report[result] = (report[result] ?? 0) + 1
  }
  return report
}
