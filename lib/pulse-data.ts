import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import { inboxState, inquiries, proposals, supportTickets, tasks } from "@/db/schema"
import { ATTENTION_RULES } from "@/lib/attention"
import { loadInbox } from "@/lib/inbox-data"
import { ROUTES } from "@/lib/nav"
import { buildPulse, type MailFacts, type PipelineFacts, type Pulse, type TaskFacts, type TicketFacts } from "@/lib/pulse"
import { isOpenState, ticketPriority, ticketState } from "@/lib/support"

/**
 * The db half of the pulse: the facts behind the four rows. The dashboard
 * page already has every open task in hand, so it passes the task facts in
 * and only "done this week" is counted here.
 */

function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Monday. */
function startOfWeek(now: Date) {
  const d = startOfDay(now)
  const dow = d.getDay() || 7
  d.setDate(d.getDate() - (dow - 1))
  return d
}

function daysBetween(from: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000))
}

const SOURCE_LABEL: Record<string, string> = { contact: "the site", retainer: "the retainer form", projects: "the projects form" }

export async function loadPulse(now: Date, taskFacts: Omit<TaskFacts, "doneWeek" | "doneToday">): Promise<Pulse> {
  const today = startOfDay(now)
  const week = startOfWeek(now)
  const month = new Date(now.getFullYear(), now.getMonth(), 1)

  const [ticketRows, inbox, snoozes, done, leadRows, proposalRows] = await Promise.all([
    db.query.supportTickets.findMany({
      where: eq(supportTickets.completed, false),
      columns: { id: true, number: true, state: true, status: true, completed: true, priority: true, firstResponseAt: true, submittedOn: true, createdAt: true, updatedAt: true, clientId: true },
      with: { client: { columns: { name: true } } },
    }),
    loadInbox(now).catch(() => null),
    db.select({ snoozedUntil: inboxState.snoozedUntil }).from(inboxState).where(eq(inboxState.state, "snoozed")),
    db
      .select({
        week: sql<number>`count(*)`,
        // A Date inside a sql`` template is not serialised by the driver; pass the ISO text and cast.
        today: sql<number>`count(*) filter (where ${tasks.completedAt} >= ${today.toISOString()}::timestamptz)`,
      })
      .from(tasks)
      .where(and(eq(tasks.status, "done"), gte(tasks.completedAt, week))),
    db
      .select({ status: inquiries.status, source: inquiries.source, createdAt: inquiries.createdAt })
      .from(inquiries)
      .where(inArray(inquiries.status, ["new", "contacted"])),
    db.query.proposals.findMany({
      where: inArray(proposals.status, ["sent", "accepted"]),
      columns: { title: true, status: true, updatedAt: true },
      with: { client: { columns: { name: true } } },
    }),
  ])

  /* ---- tickets */
  let open = 0
  const clients = new Set<string>()
  let needAnswer = 0
  let urgent = 0
  let overdue = 0
  let oldestOverdue: { days: number; client: string | null; href: string } | null = null
  let waiting = 0
  let oldestWaitingDays: number | null = null
  for (const t of ticketRows) {
    const state = ticketState(t)
    if (!isOpenState(state)) continue
    open += 1
    if (t.clientId) clients.add(t.clientId)
    if (state === "waiting") {
      waiting += 1
      const age = daysBetween(t.updatedAt ?? t.createdAt, now)
      if (oldestWaitingDays == null || age > oldestWaitingDays) oldestWaitingDays = age
      continue
    }
    if (t.firstResponseAt) continue
    needAnswer += 1
    const priority = ticketPriority(t.priority)
    if (priority === "urgent" || priority === "high") urgent += 1
    const opened = t.submittedOn ? new Date(`${t.submittedOn}T00:00:00`) : t.createdAt
    const age = daysBetween(opened, now)
    if (age >= ATTENTION_RULES.ticketReplyDays[priority]) {
      overdue += 1
      if (!oldestOverdue || age > oldestOverdue.days) oldestOverdue = { days: age, client: t.client?.name ?? null, href: `${ROUTES.support}/${t.number}` }
    }
  }
  const tickets: TicketFacts = {
    open,
    clients: clients.size,
    needAnswer,
    urgent,
    overdue,
    oldestOverdueDays: oldestOverdue?.days ?? null,
    oldestOverdueClient: oldestOverdue?.client ?? null,
    oldestOverdueHref: oldestOverdue?.href ?? null,
    waiting,
    oldestWaitingDays,
  }

  /* ---- mail (tickets and leads have rows of their own; events are the Calendar's) */
  const mailItems = inbox?.items.filter((i) => i.kind === "mail" || i.kind === "message") ?? []
  const unreadItems = mailItems.filter((i) => i.state === "unread")
  const owedItems = mailItems.filter((i) => i.needsReply && i.state !== "snoozed")
  const mail: MailFacts = {
    unread: unreadItems.length,
    oldestUnreadDays: unreadItems.length ? Math.max(...unreadItems.map((i) => i.ageDays)) : null,
    owed: owedItems.length,
    oldestOwedDays: owedItems.length ? Math.max(...owedItems.map((i) => i.ageDays)) : null,
    backToday: snoozes.filter((s) => s.snoozedUntil && s.snoozedUntil >= today && s.snoozedUntil <= now).length,
    snoozed: snoozes.filter((s) => s.snoozedUntil && s.snoozedUntil > now).length,
  }

  /* ---- tasks: the page's facts plus what got done */
  const taskFactsFull: TaskFacts = { ...taskFacts, doneWeek: Number(done[0]?.week ?? 0), doneToday: Number(done[0]?.today ?? 0) }

  /* ---- pipeline */
  const newLeads = leadRows.filter((l) => l.status === "new").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const talking = leadRows.filter((l) => l.status === "contacted")
  const out = proposalRows
    .filter((p) => p.status === "sent")
    .map((p) => ({ name: p.client?.name ?? p.title, days: daysBetween(p.updatedAt, now) }))
    .sort((a, b) => a.days - b.days)
  const accepted = proposalRows.filter((p) => p.status === "accepted" && p.updatedAt >= month).map((p) => ({ name: p.client?.name ?? p.title }))
  const pipeline: PipelineFacts = {
    newLeads: newLeads.length,
    newestLeadDays: newLeads[0] ? daysBetween(newLeads[0].createdAt, now) : null,
    newestLeadSource: newLeads[0] ? SOURCE_LABEL[newLeads[0].source] ?? newLeads[0].source : null,
    talking: talking.length,
    oldestTalkingDays: talking.length ? Math.max(...talking.map((l) => daysBetween(l.createdAt, now))) : null,
    out,
    accepted,
  }

  return buildPulse({ tickets, mail, tasks: taskFactsFull, pipeline })
}
