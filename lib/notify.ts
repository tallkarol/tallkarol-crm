import { and, eq, isNull } from "drizzle-orm"
import webpush from "web-push"
import { db } from "@/db"
import { appSettings, notificationLog, pushSubscriptions } from "@/db/schema"
import { workspaceTimezone } from "@/lib/timezone"

/**
 * One place that decides whether something is worth saying, then says it to
 * every device that opted in.
 *
 * The catalog mirrors `NotificationCatalog.swift` in the widget app — same
 * kinds, same defaults, same dedupe keys — so the Mac's local notifications
 * and the phone's push notifications describe the same events and switch off
 * together. The unique index on `notification_log(kind, dedupe_key)` is the
 * dedupe: a flag that stays raised for five days inserts once.
 */

export type NotificationKind =
  | "clock.long"
  | "clock.idle"
  | "task.due"
  | "task.overdue"
  | "ticket.new"
  | "flag.hot"
  | "flag.warn"
  | "ops.monitor"
  | "punchlist.test"
  | "leftoff.return"
  | "leftoff.briefing"

export type KindSpec = {
  kind: NotificationKind
  title: string
  summary: string
  defaultOn: boolean
  /** Ops kinds get through quiet hours; nothing else does. */
  ignoresQuietHours: boolean
}

export const NOTIFICATION_KINDS: KindSpec[] = [
  { kind: "clock.long", title: "Still clocked in", summary: "A punch has been running for more than eight hours.", defaultOn: true, ignoresQuietHours: false },
  { kind: "clock.idle", title: "Nothing clocked today", summary: "It is 11:00 on a weekday and no time has been logged.", defaultOn: false, ignoresQuietHours: false },
  { kind: "task.due", title: "Due today", summary: "One digest at 08:00 listing what is due today.", defaultOn: true, ignoresQuietHours: false },
  { kind: "task.overdue", title: "Task overdue", summary: "A task's due date has passed.", defaultOn: true, ignoresQuietHours: false },
  { kind: "ticket.new", title: "New ticket", summary: "A support ticket appeared.", defaultOn: true, ignoresQuietHours: false },
  { kind: "flag.hot", title: "Needs you", summary: "The Delivery ledger raised a hot flag.", defaultOn: true, ignoresQuietHours: false },
  { kind: "flag.warn", title: "Worth a look", summary: "The Delivery ledger raised a warning.", defaultOn: false, ignoresQuietHours: false },
  { kind: "ops.monitor", title: "Monitor raised a ticket", summary: "A client app's scheduled job missed its window.", defaultOn: true, ignoresQuietHours: true },
  { kind: "punchlist.test", title: "Test requested", summary: "A punch-list item is waiting for an agent to run its test.", defaultOn: true, ignoresQuietHours: false },
  // Fired locally by the Mac app when you come back after being away — the
  // CRM only carries the switch so it can be turned off with the others.
  { kind: "leftoff.return", title: "Back at the desk", summary: "What was parked while you were away.", defaultOn: true, ignoresQuietHours: false },
  // You asked for it by unlocking the Mac, and 06:30 is inside quiet hours.
  { kind: "leftoff.briefing", title: "Morning briefing", summary: "Once a day, on the first unlock: what was parked, finished or lost overnight.", defaultOn: true, ignoresQuietHours: true },
]

const SPEC = new Map(NOTIFICATION_KINDS.map((k) => [k.kind, k]))

/* ------------------------------------------------------------ preferences */

export type NotificationPrefs = {
  kinds: Partial<Record<NotificationKind, boolean>>
  quietFrom: number
  quietTo: number
  /** First-run seeding done — see `seedIfFirstRun`. */
  seeded: boolean
}

const PREFS_KEY = "notifications"

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, PREFS_KEY) })
  const v = (row?.value ?? {}) as Partial<NotificationPrefs>
  return {
    kinds: typeof v.kinds === "object" && v.kinds ? v.kinds : {},
    quietFrom: typeof v.quietFrom === "number" ? v.quietFrom : 21,
    quietTo: typeof v.quietTo === "number" ? v.quietTo : 7,
    seeded: v.seeded === true,
  }
}

export async function setNotificationPrefs(patch: Partial<NotificationPrefs>) {
  const current = await getNotificationPrefs()
  const next: NotificationPrefs = {
    ...current,
    ...patch,
    kinds: { ...current.kinds, ...(patch.kinds ?? {}) },
  }
  await db
    .insert(appSettings)
    .values({ key: PREFS_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } })
  return next
}

export function kindEnabled(prefs: NotificationPrefs, kind: NotificationKind) {
  const stored = prefs.kinds[kind]
  if (typeof stored === "boolean") return stored
  return SPEC.get(kind)?.defaultOn ?? false
}

/** Hour of the day in the workspace timezone — quiet hours are local hours. */
function localHour(now: Date, tz: string) {
  const text = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now)
  return Number(text) % 24
}

export function isQuiet(prefs: NotificationPrefs, now: Date, tz: string) {
  const hour = localHour(now, tz)
  if (prefs.quietFrom > prefs.quietTo) return hour >= prefs.quietFrom || hour < prefs.quietTo
  return hour >= prefs.quietFrom && hour < prefs.quietTo
}

/* ----------------------------------------------------------------- VAPID */

let vapidReady = false
let vapidWarned = false

function ensureVapid(): boolean {
  if (vapidReady) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@tallkarol.com"
  if (!pub || !priv) {
    if (!vapidWarned) {
      console.warn("web push: VAPID keys missing — notifications are logged but not sent")
      vapidWarned = true
    }
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  vapidReady = true
  return true
}

/* ----------------------------------------------------------------- send */

export type PushPayload = {
  title: string
  body: string
  url: string
  kind?: string
  tag?: string
}

export type SendReport = { sent: number; failed: number; pruned: number }

/** Deliver to every live subscription, pruning the ones the push service disowns. */
export async function sendToAll(payload: PushPayload): Promise<SendReport> {
  const report: SendReport = { sent: 0, failed: 0, pruned: 0 }
  if (!ensureVapid()) return report

  const subs = await db.query.pushSubscriptions.findMany({
    where: isNull(pushSubscriptions.revokedAt),
  })
  const body = JSON.stringify(payload)

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 * 6, urgency: "normal" }
        )
        report.sent += 1
        await db
          .update(pushSubscriptions)
          .set({ lastOkAt: new Date(), failCount: 0 })
          .where(eq(pushSubscriptions.id, sub.id))
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // The browser unsubscribed or the endpoint expired. Gone for good.
          report.pruned += 1
          await db
            .update(pushSubscriptions)
            .set({ revokedAt: new Date() })
            .where(eq(pushSubscriptions.id, sub.id))
        } else {
          report.failed += 1
          await db
            .update(pushSubscriptions)
            .set({ failCount: sub.failCount + 1 })
            .where(eq(pushSubscriptions.id, sub.id))
        }
      }
    })
  )
  return report
}

export type NotifyInput = {
  kind: NotificationKind
  dedupeKey: string
  title?: string
  body: string
  url: string
  userId?: string | null
  now?: Date
}

export type NotifyResult = "sent" | "duplicate" | "off" | "quiet" | "unsent"

/**
 * Say something once. Preference, quiet hours, then the dedupe insert — in
 * that order, so a muted kind never even writes a row.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const now = input.now ?? new Date()
  const spec = SPEC.get(input.kind)
  const prefs = await getNotificationPrefs()
  if (!kindEnabled(prefs, input.kind)) return "off"

  const tz = await workspaceTimezone()
  if (!spec?.ignoresQuietHours && isQuiet(prefs, now, tz)) return "quiet"

  const title = input.title ?? spec?.title ?? "TallKarol"
  const inserted = await db
    .insert(notificationLog)
    .values({
      userId: input.userId ?? null,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      title,
      body: input.body,
      url: input.url,
      sentAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id })
  if (inserted.length === 0) return "duplicate"

  const report = await sendToAll({
    title,
    body: input.body,
    url: input.url,
    kind: input.kind,
    tag: `${input.kind}:${input.dedupeKey}`,
  })
  return report.sent > 0 ? "sent" : "unsent"
}

/**
 * First run: remember what already exists without announcing it. Otherwise
 * the first tick after deploy would send nine old tickets and forty flags.
 */
export async function recordSeeded(kind: NotificationKind, dedupeKey: string, now = new Date()) {
  await db
    .insert(notificationLog)
    .values({ kind, dedupeKey, seeded: true, sentAt: now })
    .onConflictDoNothing()
}

/** Straight to every device, no catalog — the Settings page's test button. */
export async function sendTest(): Promise<SendReport> {
  return sendToAll({
    title: "TallKarol",
    body: "Push is working on this device.",
    url: "/settings/notifications",
    kind: "test",
    tag: "test",
  })
}

/** Live subscriptions, for the settings page's "this device" line. */
export async function liveSubscriptionCount() {
  const rows = await db.query.pushSubscriptions.findMany({
    where: and(isNull(pushSubscriptions.revokedAt)),
    columns: { id: true },
  })
  return rows.length
}
