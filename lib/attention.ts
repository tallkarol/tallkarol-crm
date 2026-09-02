import type {
  DeliverableStatus,
  InvoiceStatus,
  ProjectStatus,
  RetainerStatus,
  WorkstreamStage,
} from "@/db/schema"
import { hideMoney, maskedMoney } from "@/lib/money-privacy"

/**
 * The one place the CRM decides that something needs you.
 *
 * Every rule is pure and takes `now`, so the thresholds can be checked without
 * a database — `npm run check:attention`. The delivery ledger's meta line, the
 * modal's "Needs you" block and the band a row falls into all read from here,
 * so those three surfaces cannot drift into disagreeing about the same row.
 */

/** How long a thing may sit in a state before the ledger says something. */
export const ATTENTION_RULES = {
  /** A workstream parked in review is usually waiting on the client. */
  reviewStaleDays: 5,
  /** Implementing feedback is our own work, so it gets a longer leash. */
  feedbackStaleDays: 7,
  waitingOnContentDays: 14,
  /** A deliverable due inside this window is worth naming on the row. */
  dueSoonDays: 14,
  /** Past this day of the month, an active retainer with no time is a problem. */
  retainerQuietFromDay: 20,
  /** Fraction of the monthly ceiling that counts as "close to it". */
  retainerNearCapPct: 0.85,
  renewalWindowDays: 45,
  /** A draft invoice this close to its issue date (or past it) needs sending. */
  draftInvoiceDays: 2,
  /** Days without a reply, by ticket priority. */
  ticketReplyDays: { urgent: 1, high: 2, normal: 5, low: 14 },
} as const

export type AttentionSeverity = "warn" | "hot"

export type AttentionFlag = {
  /** Stable within one engagement, so React keys and tests can name a rule. */
  key: string
  severity: AttentionSeverity
  /** Short enough to sit on the row's single meta line. */
  short: string
  /** A full sentence for the modal's "Needs you" block. */
  detail: string
}

/* ------------------------------------------------------------------ inputs */

export type WorkstreamFacts = {
  title: string
  stage: WorkstreamStage
  updatedAt: Date
}

/**
 * `deliverables` carries no timestamps, so a flag here can say that something
 * is done and uninvoiced but never how long it has been that way. Adding
 * `deliverables.updated_at` is what would let these age.
 */
export type DeliverableFacts = {
  label: string
  title: string
  status: DeliverableStatus
  feeCents: number | null
  dueOn: string | null
}

export type InvoiceFacts = {
  number: string
  status: InvoiceStatus
  issuedOn: string
  amountCents: number
}

export type TicketFacts = {
  priority: "urgent" | "high" | "normal" | "low"
  ageDays: number
  answered: boolean
}

export type ProjectFacts = {
  status: ProjectStatus
  updatedAt: Date
  workstreams: WorkstreamFacts[]
  deliverables: DeliverableFacts[]
  invoices: InvoiceFacts[]
  tickets: TicketFacts[]
}

export type RetainerFacts = {
  status: RetainerStatus
  hoursPerMonth: number
  endsOn: string | null
  hoursThisMonth: number
  invoicedThisMonth: boolean
  invoices: InvoiceFacts[]
  tickets: TicketFacts[]
  hasRenewalTask: boolean
}

/* ------------------------------------------------------------------ helpers */

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/** Whole days from today to a `YYYY-MM-DD`; negative once it is in the past. */
export function daysUntil(iso: string, now: Date) {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return null
  const target = new Date(y, m - 1, d, 23, 59, 59)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((target.getTime() - today.getTime()) / 86_400_000)
}

function money(cents: number) {
  if (hideMoney()) return maskedMoney()
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

const STAGE_STALE_DAYS: Partial<Record<WorkstreamStage, number>> = {
  review: ATTENTION_RULES.reviewStaleDays,
  feedback: ATTENTION_RULES.feedbackStaleDays,
}

const STAGE_WORD: Partial<Record<WorkstreamStage, string>> = {
  review: "in review",
  feedback: "in feedback",
}

/** Late drafts first, then hot before warn — the row shows flags[0]. */
function rank(flags: AttentionFlag[]) {
  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "hot" ? -1 : 1))
}

/* ----------------------------------------------------------------- invoices */

function draftInvoiceFlags(invoices: InvoiceFacts[], now: Date): AttentionFlag[] {
  const flags: AttentionFlag[] = []
  for (const invoice of invoices) {
    if (invoice.status !== "draft") continue
    const days = daysUntil(invoice.issuedOn, now)
    if (days == null || days > ATTENTION_RULES.draftInvoiceDays) continue
    flags.push({
      key: `invoice-draft:${invoice.number}`,
      severity: "hot",
      short: `${invoice.number} still draft`,
      detail:
        days < 0
          ? `${invoice.number} is still a draft at ${money(invoice.amountCents)} and its issue date passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`
          : `${invoice.number} is still a draft at ${money(invoice.amountCents)} and issues ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}.`,
    })
  }
  return flags
}

/* ------------------------------------------------------------------ tickets */

function ticketFlags(tickets: TicketFacts[], now: Date): AttentionFlag[] {
  void now
  const overdue = tickets.filter(
    (t) => !t.answered && t.ageDays >= ATTENTION_RULES.ticketReplyDays[t.priority]
  )
  if (overdue.length === 0) return []
  const oldest = overdue.reduce((a, b) => (a.ageDays >= b.ageDays ? a : b))
  return [
    {
      key: "tickets-unanswered",
      severity: "hot",
      short:
        overdue.length === 1
          ? `1 ticket unanswered, ${oldest.ageDays}d`
          : `${overdue.length} tickets unanswered, oldest ${oldest.ageDays}d`,
      detail:
        overdue.length === 1
          ? `A ${oldest.priority} ticket has gone ${oldest.ageDays} days without a reply.`
          : `${overdue.length} tickets have gone without a reply. The oldest is ${oldest.ageDays} days old.`,
    },
  ]
}

/* ----------------------------------------------------------------- projects */

export function projectAttention(project: ProjectFacts, now = new Date()): AttentionFlag[] {
  const flags: AttentionFlag[] = []

  // A deliverable that is done but has no invoice is money left on the table.
  const uninvoiced = project.deliverables.filter(
    (d) => d.status === "done" && (d.feeCents ?? 0) > 0
  )
  if (uninvoiced.length > 0) {
    const total = uninvoiced.reduce((sum, d) => sum + (d.feeCents ?? 0), 0)
    const names = uninvoiced.map((d) => d.label).join(", ")
    flags.push({
      key: "deliverable-uninvoiced",
      severity: "hot",
      short: `${names} done, not invoiced`,
      detail: `${names} ${uninvoiced.length === 1 ? "is" : "are"} marked done and never invoiced — ${money(total)} ready to bill.`,
    })
  }

  // Dated deliverables: overdue is hot, due soon is worth a mention.
  for (const d of project.deliverables) {
    if (!d.dueOn || d.status === "invoiced" || d.status === "paid") continue
    const days = daysUntil(d.dueOn, now)
    if (days == null) continue
    if (days < 0) {
      flags.push({
        key: `deliverable-overdue:${d.label}`,
        severity: "hot",
        short: `${d.label} overdue ${Math.abs(days)}d`,
        detail: `${d.label} — ${d.title} — was due ${dayLabel(d.dueOn)}, ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`,
      })
    } else if (days <= ATTENTION_RULES.dueSoonDays) {
      flags.push({
        key: `deliverable-due:${d.label}`,
        severity: "warn",
        short: `${d.label} due ${dayLabel(d.dueOn)}`,
        detail: `${d.label} — ${d.title} — is due ${dayLabel(d.dueOn)}, ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}.`,
      })
    }
  }

  // Workstreams parked in a stage that is supposed to move.
  for (const w of project.workstreams) {
    const limit = STAGE_STALE_DAYS[w.stage]
    if (limit == null) continue
    const age = daysBetween(w.updatedAt, now)
    if (age < limit) continue
    flags.push({
      key: `workstream-stale:${w.title}`,
      severity: "warn",
      short: `${w.title} ${STAGE_WORD[w.stage]} ${age}d`,
      detail: `${w.title} has been ${STAGE_WORD[w.stage]} for ${age} days.`,
    })
  }

  if (project.status === "waiting_on_content") {
    const age = daysBetween(project.updatedAt, now)
    if (age >= ATTENTION_RULES.waitingOnContentDays) {
      flags.push({
        key: "waiting-on-content",
        severity: "warn",
        short: `waiting on content ${age}d`,
        detail: `Nothing has moved on this project for ${age} days while it waits on content.`,
      })
    }
  }

  flags.push(...draftInvoiceFlags(project.invoices, now))
  flags.push(...ticketFlags(project.tickets, now))
  return rank(flags)
}

/* ---------------------------------------------------------------- retainers */

export function retainerAttention(retainer: RetainerFacts, now = new Date()): AttentionFlag[] {
  const flags: AttentionFlag[] = []
  const cap = retainer.hoursPerMonth
  const hours = retainer.hoursThisMonth
  const monthName = now.toLocaleDateString("en-US", { month: "long" })

  if (retainer.status === "active") {
    if (hours <= 0 && now.getDate() >= ATTENTION_RULES.retainerQuietFromDay) {
      const left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
      flags.push({
        key: "retainer-quiet",
        severity: "hot",
        short: `nothing logged in ${monthName}`,
        detail: `No time has been logged against this retainer in ${monthName}, with ${left} day${left === 1 ? "" : "s"} left in the month.`,
      })
    } else if (cap > 0 && hours > cap) {
      flags.push({
        key: "retainer-over-cap",
        severity: "hot",
        short: `${(hours - cap).toFixed(1)}h over ceiling`,
        detail: `${hours.toFixed(1)} hours logged against a ${cap}h ceiling — ${(hours - cap).toFixed(1)} hours over.`,
      })
    } else if (cap > 0 && hours >= cap * ATTENTION_RULES.retainerNearCapPct) {
      flags.push({
        key: "retainer-near-cap",
        severity: "warn",
        short: `${(cap - hours).toFixed(1)}h headroom left`,
        detail: `${hours.toFixed(1)} of ${cap} hours used this month — ${(cap - hours).toFixed(1)} left before the ceiling.`,
      })
    }
  }

  if (retainer.endsOn && retainer.status === "active") {
    const days = daysUntil(retainer.endsOn, now)
    if (days != null && days >= 0 && days <= ATTENTION_RULES.renewalWindowDays) {
      flags.push({
        key: "retainer-renewal",
        severity: retainer.hasRenewalTask ? "warn" : "hot",
        short: `renews ${dayLabel(retainer.endsOn)}`,
        detail: retainer.hasRenewalTask
          ? `This retainer ends ${dayLabel(retainer.endsOn)}, in ${days} days. A renewal task is filed.`
          : `This retainer ends ${dayLabel(retainer.endsOn)}, in ${days} days, and no renewal task has been filed.`,
      })
    }
  }

  flags.push(...draftInvoiceFlags(retainer.invoices, now))
  flags.push(...ticketFlags(retainer.tickets, now))
  return rank(flags)
}

/* -------------------------------------------------------------------- bands */

export const BANDS = ["needs-you", "moving", "waiting", "quiet", "closed"] as const
export type BandId = (typeof BANDS)[number]

export const BAND_LABEL: Record<BandId, string> = {
  "needs-you": "Needs you",
  moving: "Moving",
  waiting: "Waiting on client",
  quiet: "Quiet",
  closed: "Closed",
}

/** How recently something must have moved to count as still moving. */
export const MOVING_WITHIN_DAYS = 14

export function projectBand(
  project: ProjectFacts,
  flags: AttentionFlag[],
  now = new Date()
): BandId {
  if (project.status === "complete") return "closed"
  if (flags.length > 0) return "needs-you"
  if (project.status === "waiting_on_content") return "waiting"
  // Parked on purpose. It has not gone quiet on us — someone decided it waits.
  if (project.status === "on_hold") return "waiting"
  const lastMove = project.workstreams.reduce<Date | null>(
    (latest, w) => (latest == null || w.updatedAt > latest ? w.updatedAt : latest),
    null
  )
  const moved = lastMove ?? project.updatedAt
  return daysBetween(moved, now) <= MOVING_WITHIN_DAYS ? "moving" : "quiet"
}

export function retainerBand(retainer: RetainerFacts, flags: AttentionFlag[]): BandId {
  if (retainer.status === "ended") return "closed"
  if (flags.length > 0) return "needs-you"
  if (retainer.status === "paused") return "waiting"
  return retainer.hoursThisMonth > 0 ? "moving" : "quiet"
}
