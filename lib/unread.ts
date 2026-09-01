import type { InboxItem } from "@/lib/inbox"
import { ROUTES } from "@/lib/nav"

/**
 * The dashboard's Unread card, and the sidebar badges that follow the same
 * rule — "is there anything I haven't seen?", answered before you read
 * anything else on the homepage.
 *
 * Deliberately a *fold* over the inbox stream rather than its own count query:
 * unread already means one exact thing (`lib/inbox-data.ts` — the absence of
 * an `inbox_state` row), and a second query computing it a second way is how
 * a badge and its page end up disagreeing. `lib/unread-data.ts` shares the one
 * `loadInbox()` per request, so this costs no extra round trips.
 *
 * PURE — no `db` import. The shell is a client component and reads the tones
 * from here, so a postgres import would land in the browser bundle.
 */

export type UnreadTone = "clear" | "lead" | "warn" | "bad"

/** Which tile an arrival lands in. Mail and chatter fall through to `other`. */
export type UnreadBucket = "leads" | "tickets" | "other"

export type UnreadGroup = {
  count: number
  /** Of those unread, how many are waiting on a reply from us. */
  needsReply: number
  tone: UnreadTone
  /** "new enquiries" · "unread · 1 needs a reply" */
  state: string
  /** Mobile: the same thing plus the age, on one line. "new · 4h" */
  shortState: string
  /** "oldest 4 hours ago · Acme Co, Jane Doe" */
  detail: string
  href: string
}

export type UnreadSummary = {
  leads: UnreadGroup
  tickets: UnreadGroup
  /** Unread mail and info-level events — the quiet line, never a tile. */
  otherCount: number
  otherLabel: string
  /** Everything unread, whichever bucket: the Inbox badge and the loud/quiet switch. */
  total: number
  /** Still waiting on a reply from us, read or not. Survives the quiet state. */
  needsReply: number
  /** When the inbox was last emptied — only meaningful while `total` is 0. */
  clearedAt: string | null
  /** False when the inbox tables aren't migrated yet; the card stays away. */
  ready: boolean
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * A monitor that fails already opens a high-priority ticket (`lib/monitors.ts`),
 * so uptime lands in the tickets tile by itself. What this catches is the rest:
 * a partial run, an error logged without a ticket behind it. Anything above
 * `info` is operational, and operational belongs with tickets rather than in
 * the quiet line where it would read as chatter.
 */
export function bucketOf(item: InboxItem): UnreadBucket {
  if (item.kind === "lead") return "leads"
  if (item.kind === "ticket" || item.kind === "message") return "tickets"
  if (item.kind === "event" && item.severity !== "info") return "tickets"
  return "other"
}

function ageMs(item: InboxItem, now: Date) {
  return Math.max(0, now.getTime() - new Date(item.occurredAt).getTime())
}

/** "4 hours ago" / "2 days ago". Short form drops the words: "4h", "2d". */
function ago(ms: number, short = false): string {
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return short ? "now" : "just now"
  if (mins < 60) return short ? `${mins}m` : `${mins} minutes ago`
  const hours = Math.floor(ms / HOUR)
  if (hours < 24) {
    if (short) return `${hours}h`
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`
  }
  const days = Math.floor(ms / DAY)
  if (short) return `${days}d`
  return `${days} ${days === 1 ? "day" : "days"} ago`
}

function plural(n: number, one: string, many = `${one}s`) {
  return n === 1 ? one : many
}

/** Person or company, whichever the item actually knows. */
function who(item: InboxItem) {
  return item.clientName || item.title
}

const EMPTY = (href: string, state: string, detail: string): UnreadGroup => ({
  count: 0,
  needsReply: 0,
  tone: "clear",
  state,
  shortState: state,
  detail,
  href,
})

function leadsGroup(all: InboxItem[], unread: InboxItem[], now: Date): UnreadGroup {
  const newest = all[0]
  if (unread.length === 0) {
    return EMPTY(
      ROUTES.leads,
      "nothing new",
      newest ? `last enquiry ${ago(ageMs(newest, now))}` : "no enquiries yet"
    )
  }

  const oldest = unread[unread.length - 1]
  const age = ageMs(oldest, now)
  // A lead that sits overnight is a lead you lose, so age alone escalates it.
  const tone: UnreadTone = age > 2 * DAY ? "bad" : age > 12 * HOUR ? "warn" : "lead"

  const names = unread.slice(0, 2).map(who)
  const rest = unread.length - names.length
  const detail = [
    `oldest ${ago(age)}`,
    [names.join(", "), rest > 0 ? `+${rest} more` : null].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    count: unread.length,
    needsReply: unread.filter((i) => i.needsReply).length,
    tone,
    state: `new ${plural(unread.length, "enquiry", "enquiries")}`,
    shortState: `new · ${ago(age, true)}`,
    detail,
    href: ROUTES.leads,
  }
}

function ticketsGroup(all: InboxItem[], unread: InboxItem[], now: Date): UnreadGroup {
  const newest = all[0]
  if (unread.length === 0) {
    return EMPTY(
      ROUTES.support,
      "nothing new",
      newest ? `last one ${ago(ageMs(newest, now))}` : "no open tickets"
    )
  }

  const oldest = unread[unread.length - 1]
  const age = ageMs(oldest, now)
  const urgent = unread.filter(
    (i) => (i.priority === "urgent" || i.priority === "high") && i.needsReply
  )
  const errors = unread.filter((i) => i.severity === "error")
  const bad = urgent.length > 0 || errors.length > 0 || age > DAY
  const needsReply = unread.filter((i) => i.needsReply).length

  // Whatever is worst is what gets named — the one detail that decides
  // whether this is opened now or after coffee.
  const worst = urgent[0] ?? errors[0] ?? oldest
  const detail = [`oldest ${ago(age)}`, who(worst)].filter(Boolean).join(" · ")

  const state = urgent.length
    ? `${urgent.length} urgent, unanswered`
    : errors.length
      ? `${errors.length} ${plural(errors.length, "failure")}`
      : needsReply > 0
        ? `unread · ${needsReply} ${needsReply === 1 ? "needs" : "need"} a reply`
        : "unread"

  const shortState = `${
    urgent.length
      ? `${urgent.length} urgent`
      : errors.length
        ? `${errors.length} failed`
        : "unread"
  } · ${ago(age, true)}`

  return {
    count: unread.length,
    needsReply,
    tone: bad ? "bad" : "warn",
    state,
    shortState,
    detail,
    href: ROUTES.support,
  }
}

/**
 * `items` arrives newest-first from `loadInbox()`; every helper below leans on
 * that, so the last unread item in a bucket is its oldest.
 */
export function summarizeUnread(
  items: InboxItem[],
  clearedAt: Date | null,
  ready: boolean,
  now = new Date()
): UnreadSummary {
  const live = items.filter((i) => i.state !== "archived")
  const unread = live.filter((i) => i.state === "unread")

  const inBucket = (rows: InboxItem[], bucket: UnreadBucket) =>
    rows.filter((i) => bucketOf(i) === bucket)

  const leads = leadsGroup(
    inBucket(live, "leads"),
    inBucket(unread, "leads"),
    now
  )
  const tickets = ticketsGroup(
    inBucket(live, "tickets"),
    inBucket(unread, "tickets"),
    now
  )

  const other = inBucket(unread, "other")
  const mail = other.filter((i) => i.kind === "mail").length
  const events = other.length - mail
  const otherLabel = [
    mail > 0 ? `${mail} ${plural(mail, "email")}` : null,
    events > 0 ? `${events} ${plural(events, "event")}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    leads,
    tickets,
    otherCount: other.length,
    otherLabel,
    total: unread.length,
    needsReply: live.filter((i) => i.needsReply && i.state !== "snoozed").length,
    clearedAt: clearedAt ? clearedAt.toISOString() : null,
    ready,
  }
}

/**
 * The loudest tone in the set — what a badge over several kinds should wear.
 * "clear" only survives if nothing else is present.
 */
export function worstTone(...tones: UnreadTone[]): UnreadTone {
  const rank: UnreadTone[] = ["bad", "warn", "lead", "clear"]
  return rank.find((tone) => tones.includes(tone)) ?? "clear"
}

/** "Fri 5:40pm" — enough to tell you the zero is fresh, not stale. */
export function clearedLabel(iso: string | null, now = new Date()): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const time = at
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" AM", "am")
    .replace(" PM", "pm")

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (at >= startOfToday) return `today, ${time}`
  const yesterday = new Date(startOfToday.getTime() - DAY)
  if (at >= yesterday) return `yesterday, ${time}`
  if (now.getTime() - at.getTime() < 7 * DAY) {
    return `${at.toLocaleDateString("en-US", { weekday: "long" })}, ${time}`
  }
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
