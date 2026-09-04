import { and, asc, eq, gte, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm"
import { db } from "@/db"
import { clients, inquiries, monitors, sessionNotes, supportTickets, tasks } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import { deriveState, LEFTOFF_RULES, type NoteState } from "@/lib/leftoff"
import { ROUTES } from "@/lib/nav"
import { loadPunchlist } from "@/lib/punchlists"
import { ticketNumber, ticketOpenedAt, ticketPriority, ticketSlug, ticketState } from "@/lib/support"
import { daysBetween, isoDay } from "@/lib/task-view"
import { widgetAgent } from "@/lib/widget-agent"
import { widgetPunchlists } from "@/lib/widget-punchlists"
import {
  buildWaiting,
  type ChatFacts,
  type InquiryFacts,
  type MonitorFacts,
  type OverdueTaskFacts,
  type PunchItemFacts,
  type SessionFacts,
  type TicketWaitFacts,
  type WaitingClient,
  type WaitingPayload,
} from "@/lib/waiting"

/**
 * The decision queue — the db half. `lib/waiting.ts` is the pure one.
 *
 * Seven reads, none of them new sources of truth. The two expensive ones are
 * folded out of widget payloads that already memoise themselves —
 * `widgetAgent()` for the unconverted sessions and `widgetPunchlists()` for
 * the open lists — so the queue cannot decide a session is unbilled while the
 * Agent Ledger says it is billed. The rest are narrow, columned queries
 * scoped to rows that could qualify.
 *
 * Deliberately NOT memoised as a whole. Every verb on the strip revalidates
 * `/`, and a queue that still shows the row you just ticked is the one bug
 * that would teach you to stop trusting it. Freshness beats a minute of
 * cache here; the two reads that would have cost something already have
 * caches of their own.
 *
 * `/api/widget/day` and `/api/widget/approvals` are deliberately left out:
 * the day view is a schedule, not a bottleneck, and approvals are somebody
 * else's queue.
 */

/* ---------------------------------------------------------------- helpers */

function clientOf(row: { slug: string | null; name: string | null }): WaitingClient | null {
  if (!row.slug) return null
  return { slug: row.slug, name: row.name ?? row.slug, color: clientColor(row.slug) }
}

/* ------------------------------------------------------------------ chats */

/**
 * The three bands where a chat is stopped and you are the reason.
 *
 * `working` is mid-turn and waiting on nobody; `gone` is history. Both are
 * excluded here rather than downstream so the query, not a filter, is what
 * keeps forty-six finished rows out of a queue of eight.
 */
const CHAT_BANDS: NoteState[] = ["blocked", "waiting", "parked"]

async function chatFacts(now: Date): Promise<ChatFacts[]> {
  const since = new Date(now.getTime() - LEFTOFF_RULES.boardWindowDays * 86_400_000)
  const rows = await db
    .select({
      sessionRef: sessionNotes.sessionRef,
      surface: sessionNotes.surface,
      title: sessionNotes.title,
      project: sessionNotes.project,
      state: sessionNotes.state,
      blockedOn: sessionNotes.blockedOn,
      lastPrompt: sessionNotes.lastPrompt,
      eventAt: sessionNotes.eventAt,
      slug: clients.slug,
      name: clients.name,
    })
    .from(sessionNotes)
    .leftJoin(clients, eq(clients.id, sessionNotes.clientId))
    .where(
      and(
        isNull(sessionNotes.dismissedAt),
        gte(sessionNotes.eventAt, since),
        // (e) — the two populations that bury the queue, excluded at the
        // source. A `repo` row is a standing fact about uncommitted work and
        // a `gone` row is a finished chat; twenty-two and forty-six of them
        // respectively is what made the board unreadable. `browser` is a tab
        // snapshot and `manual` is a post-it you wrote to yourself — neither
        // is a chat stopped on you, which is the same call `buildPayload`
        // makes when it refuses to count them.
        sql`${sessionNotes.state} <> 'gone'`,
        notInArray(sessionNotes.surface, ["repo", "browser", "manual"]),
        // Already answered from the board: the chat owes you the next turn,
        // not the other way round.
        eq(sessionNotes.reply, "")
      )
    )
    .orderBy(asc(sessionNotes.eventAt))
    .limit(200)

  return rows.flatMap((row) => {
    const state = deriveState(row, now)
    if (!CHAT_BANDS.includes(state)) return []
    return [
      {
        sessionRef: row.sessionRef,
        surface: row.surface,
        title: row.title,
        project: row.project,
        state,
        blockedOn: row.blockedOn,
        lastPrompt: row.lastPrompt,
        eventAt: row.eventAt,
        client: clientOf(row),
        // The board is where a chat is actually worked; the strip's own reply
        // box is the fast path and this is the full one.
        href: `${ROUTES.home}#leftoff`,
      },
    ]
  })
}

/* --------------------------------------------------------------- sessions */

/** (f) — the Agent Ledger's own unconverted queue, re-cut as a kind. */
async function sessionFacts(now: Date): Promise<SessionFacts[]> {
  // `undefined` takes the ledger's own default window, which is also what the
  // widget route asks for — so both share the one memoised answer.
  const ledger = await widgetAgent(undefined, now)
  return ledger.unconverted.map((row) => ({
    sessionRef: row.sessionRef,
    name: row.name,
    summary: row.summary,
    hours: row.hours,
    // A session with neither stamp still ended before it was queued; `now` is
    // the only honest floor and reads as "just now" rather than 1970.
    endedAt: row.endedAt ? new Date(row.endedAt) : row.startedAt ? new Date(row.startedAt) : now,
    client: { slug: row.slug, name: row.client, color: row.color },
    href: row.href,
  }))
}

/* ------------------------------------------------------------ punch lists */

/**
 * (f) — the punch-list widget's index says which lists are open; the list
 * loader says what is on them.
 *
 * `loadPunchlist` rather than `widgetPunchlist`, because the widget's detail
 * payload drops done items and the untested kind lives exactly there: an item
 * ticked done whose test never ran. Both go through `itemState()` over the
 * item's task, so a row cannot read `todo` here and `done` on the page.
 */
async function punchItemFacts(): Promise<PunchItemFacts[]> {
  const index = await widgetPunchlists()
  const out: PunchItemFacts[] = []

  for (const list of index.lists) {
    const loaded = await loadPunchlist(list.slug)
    if (!loaded) continue
    const client: WaitingClient = {
      slug: loaded.client.slug,
      name: loaded.client.name,
      color: clientColor(loaded.client.slug),
    }
    loaded.items.forEach((row, i) => {
      out.push({
        id: row.id,
        taskId: row.taskId,
        listTitle: loaded.title,
        index: i + 1,
        title: row.title,
        state: row.state,
        hasTest: row.test !== null,
        testStatus: row.lastTestStatus,
        filedAt: loaded.createdAt,
        client,
        href: row.taskId
          ? `${ROUTES.punchlist(loaded.slug)}?peek=task:${row.taskId}`
          : ROUTES.punchlist(loaded.slug),
      })
    })
  }
  return out
}

/* ---------------------------------------------------------------- tickets */

async function ticketFacts(): Promise<TicketWaitFacts[]> {
  const rows = await db
    .select({
      id: supportTickets.id,
      number: supportTickets.number,
      title: supportTickets.title,
      status: supportTickets.status,
      state: supportTickets.state,
      priority: supportTickets.priority,
      completed: supportTickets.completed,
      submittedOn: supportTickets.submittedOn,
      firstResponseAt: supportTickets.firstResponseAt,
      createdAt: supportTickets.createdAt,
      slug: clients.slug,
      name: clients.name,
    })
    .from(supportTickets)
    .leftJoin(clients, eq(clients.id, supportTickets.clientId))
    // Nobody has replied yet — the one fact that makes an ageing ticket ours
    // rather than the client's. A ticket we have answered is waiting on them.
    .where(and(eq(supportTickets.completed, false), isNull(supportTickets.firstResponseAt)))
    .limit(200)

  return rows.flatMap((row) => {
    if (ticketState(row) === "closed") return []
    return [
      {
        id: row.id,
        number: ticketNumber(row),
        title: row.title,
        priority: ticketPriority(row.priority),
        openedAt: ticketOpenedAt(row),
        client: clientOf(row),
        href: `${ROUTES.support}/${ticketSlug(row)}`,
      },
    ]
  })
}

/* ------------------------------------------------------------------ tasks */

/**
 * Overdue only — Karol's ruling. The tasks page holds fifty-eight open rows
 * and the queue is not the tasks page; a task earns a slot by having already
 * missed a date, not by existing. Repeats are left out for the reason
 * `lib/widget.ts` gives: every repeating task is due every period, so they
 * would sit here forever.
 */
async function overdueTaskFacts(now: Date): Promise<OverdueTaskFacts[]> {
  const today = isoDay(now)
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueOn: tasks.dueOn,
      slug: clients.slug,
      name: clients.name,
    })
    .from(tasks)
    .leftJoin(clients, eq(clients.id, tasks.clientId))
    .where(
      and(
        eq(tasks.status, "open"),
        eq(tasks.cadence, "none"),
        lt(tasks.dueOn, today),
        or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, today))
      )
    )
    .orderBy(asc(tasks.dueOn))
    .limit(100)

  return rows.map((row) => {
    const dueOn = row.dueOn as string
    const [y, m, d] = dueOn.split("-").map(Number)
    return {
      id: row.id,
      title: row.title,
      dueOn,
      daysOver: daysBetween(dueOn, today),
      // The due day itself, so the card's age and its "N days past due" are
      // the same number — and the same number the Needs-attention list has
      // always printed. Aging from the end of that day instead would put "1d"
      // next to "2 days past its due date" on one card.
      overdueSince: new Date(y, m - 1, d),
      client: clientOf(row),
      href: `${ROUTES.home}?peek=task:${row.id}`,
    }
  })
}

/* --------------------------------------------------------------- monitors */

async function monitorFacts(now: Date): Promise<MonitorFacts[]> {
  const rows = await db
    .select({
      slug: monitors.slug,
      name: monitors.name,
      failStreak: monitors.failStreak,
      openTicketId: monitors.openTicketId,
      lastSuccessAt: monitors.lastSuccessAt,
      lastRunAt: monitors.lastRunAt,
      createdAt: monitors.createdAt,
      clientSlug: clients.slug,
      clientName: clients.name,
    })
    .from(monitors)
    .leftJoin(clients, eq(clients.id, monitors.clientId))
    .where(
      and(
        eq(monitors.paused, false),
        // Failing, or already carrying an incident nobody has closed.
        or(sql`${monitors.failStreak} > 0`, sql`${monitors.openTicketId} is not null`)
      )
    )
    .limit(50)

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    failStreak: row.failStreak,
    hasOpenIncident: row.openTicketId !== null,
    // A monitor that has never once succeeded has no healthy mark to age
    // from; the row's own birthday is the next most honest clock.
    since: row.lastSuccessAt ?? row.lastRunAt ?? row.createdAt,
    client: clientOf({ slug: row.clientSlug, name: row.clientName }),
    href: ROUTES.uptime,
  }))
}

/* -------------------------------------------------------------- enquiries */

async function inquiryFacts(): Promise<InquiryFacts[]> {
  const rows = await db
    .select({
      id: inquiries.id,
      name: inquiries.name,
      company: inquiries.company,
      source: inquiries.source,
      createdAt: inquiries.createdAt,
    })
    .from(inquiries)
    .where(eq(inquiries.status, "new"))
    .orderBy(asc(inquiries.createdAt))
    .limit(50)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company ?? "",
    source: row.source,
    createdAt: row.createdAt,
    href: ROUTES.inquiry(row.id),
  }))
}

/* ------------------------------------------------------------------ build */

export async function loadWaiting(now = new Date()): Promise<WaitingPayload> {
  await ensureClientColors().catch(() => ({}))
  const [chats, sessions, punchItems, tickets, overdueTasks, monitorRows, inquiryRows] =
    await Promise.all([
      chatFacts(now),
      sessionFacts(now),
      punchItemFacts(),
      ticketFacts(),
      overdueTaskFacts(now),
      monitorFacts(now),
      inquiryFacts(),
    ])

  return buildWaiting(
    {
      chats,
      sessions,
      punchItems,
      tickets,
      overdueTasks,
      monitors: monitorRows,
      inquiries: inquiryRows,
    },
    now
  )
}
