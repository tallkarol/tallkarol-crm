import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { calendarEvents, clients, deliverables, projects, retainers, tasks, timeEntries } from "@/db/schema"
import { ATTENTION_RULES } from "@/lib/attention"
import { clientColor } from "@/lib/client-colors"
import { loadClientRoster, type RosterRow } from "@/lib/client-hub"
import { focusFor, type FocusSet } from "@/lib/focus-data"
import { isoDay, weekEnd } from "@/lib/horizon"
import { loadInbox } from "@/lib/inbox-data"
import type { InboxKind } from "@/lib/inbox"
import { notesForClient } from "@/lib/meeting-notes"
import { loadMonitorBoard } from "@/lib/monitors"
import { ROUTES } from "@/lib/nav"
import { ticketPriority } from "@/lib/support"
import { loadSiteUptimeBoard } from "@/lib/uptimerobot"
import { approvalLine } from "@/lib/waiting"
import { approvalFacts } from "@/lib/waiting-data"
import { CLIENT_STATUS_LABEL } from "@/lib/work"

/**
 * Loaders for the client rooms (the panel in client mode, the Board's week
 * strip and Signals). Each one returns plain serialisable data — the rooms'
 * client components take these as props.
 */

/* ------------------------------------------------------------ the shell */

export type ClientShell = {
  id: string
  slug: string
  name: string
  short: string
  color: string
  status: string
  statusLabel: string
  statusTone: "good" | "contact" | "mute"
}

export function shortOf(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/)
  const s = words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)
  return s.toUpperCase()
}

const ACTIVE_STATUSES = new Set(["active_retainer", "project_started", "deposit_paid", "deliverable_invoice_submitted"])
const QUIET_STATUSES = new Set(["completed_work", "lapsed_retainer", "project_finished", "lost"])

export async function loadClientShell(slug: string): Promise<ClientShell | null> {
  const row = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    columns: { id: true, slug: true, name: true, status: true },
  })
  if (!row) return null
  const label = (CLIENT_STATUS_LABEL as Record<string, string>)[row.status] ?? row.status
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    short: shortOf(row.name),
    color: clientColor(row.slug),
    status: row.status,
    statusLabel: label,
    statusTone: ACTIVE_STATUSES.has(row.status) ? "good" : QUIET_STATUSES.has(row.status) ? "mute" : "contact",
  }
}

/* ------------------------------------------------------------ the panel */

export type PanelMonitor = { id: string; label: string; tone: "good" | "warn" | "bad" | "mute"; href: string }

export type ClientPanelData = {
  roster: { slug: string; name: string; short: string; color: string; hot: boolean; warn: boolean }[]
  badges: { inbox: number; inboxHot: boolean; monitors: number; board: number }
  monitors: PanelMonitor[]
}

export async function loadClientPanel(client: ClientShell, now = new Date()): Promise<ClientPanelData> {
  const [roster, signals, dots, openTasks] = await Promise.all([
    loadClientRoster(now),
    loadSignals(client, now),
    loadPanelMonitors(client),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.clientId, client.id), eq(tasks.status, "open"))),
  ])
  return {
    roster: roster.rows.map((r: RosterRow) => ({
      slug: r.slug,
      name: r.name,
      short: shortOf(r.name),
      color: r.color,
      hot: r.ticketsWaiting > 0,
      warn: r.overdueTasks > 0,
    })),
    badges: {
      inbox: signals.total,
      inboxHot: signals.rows.some((s) => s.late),
      monitors: dots.filter((d) => d.tone === "bad").length,
      board: openTasks[0]?.n ?? 0,
    },
    monitors: dots,
  }
}

/** The dot list at the bottom of the panel: one row per thing the client has running. */
export async function loadPanelMonitors(client: ClientShell): Promise<PanelMonitor[]> {
  const [sites, board] = await Promise.all([
    loadSiteUptimeBoard().catch(() => ({ configured: false, error: null, rows: [] })),
    loadMonitorBoard(1).catch(() => []),
  ])
  const out: PanelMonitor[] = []
  for (const row of sites.rows) {
    if (row.site.client?.slug !== client.slug) continue
    const status = row.monitor?.status ?? "unknown"
    out.push({
      id: `site:${row.site.id}`,
      label: row.site.origin.replace(/^https?:\/\/(www\.)?/, "") || row.site.name,
      tone: status === "up" ? "good" : status === "down" || status === "seems_down" ? "bad" : status === "paused" ? "mute" : "warn",
      href: ROUTES.clientRoom(client.slug, "monitors"),
    })
  }
  for (const row of board) {
    if (row.monitor.client?.slug !== client.slug) continue
    const last = row.runs[row.runs.length - 1]
    const tone = row.monitor.paused ? "mute" : row.monitor.failStreak > 0 ? "bad" : last?.status === "partial" ? "warn" : "good"
    out.push({ id: `monitor:${row.monitor.id}`, label: row.monitor.name || row.monitor.slug, tone, href: ROUTES.clientRoom(client.slug, "monitors") })
  }
  return out
}

/* ------------------------------------------------------------ the week */

export type WeekItem =
  | { kind: "event"; id: string; day: number; startsAt: string; endsAt: string; title: string; mine: boolean; who: string | null; allDay: boolean; href: string | null; /** The event's client colour, for the everyone view. */ color?: string }
  | { kind: "due"; id: string; day: number; title: string; flavour: "due" | "money" | "repeat"; href: string | null }

export type WeekData = {
  /** ISO Monday of the week. */
  start: string
  days: { iso: string; num: number; dow: string }[]
  /** Index into `days`, or -1 when today is outside the shown week. */
  todayIndex: number
  items: WeekItem[]
}

const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(y, m - 1, d + n)
  return isoDay(date)
}

export function weekStart(today: string) {
  const [y, m, d] = today.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const dow = date.getDay() || 7
  date.setDate(date.getDate() - (dow - 1))
  return isoDay(date)
}

/** The Mon–Sun frame a week view reads: its bounds, its days, and a day's index. Shared with the product hub. */
export function weekFrame(now: Date, anchor?: string) {
  const today = isoDay(now)
  const start = weekStart(anchor ?? today)
  const end = addDays(start, 7)
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i)
    return { iso, num: Number(iso.slice(8, 10)), dow: DOWS[i] }
  })
  return {
    today,
    start,
    end,
    from: new Date(`${start}T00:00:00`),
    to: new Date(`${end}T00:00:00`),
    days,
    dayIndex: (iso: string) => days.findIndex((d) => d.iso === iso),
  }
}

export async function loadWeek(client: ClientShell, now = new Date(), anchor?: string): Promise<WeekData> {
  const { today, start, end, from, to, days, dayIndex } = weekFrame(now, anchor)

  const [events, dueDeliverables, dueTasks, activeRetainers, monthHours] = await Promise.all([
    db.query.calendarEvents.findMany({
      where: and(eq(calendarEvents.cancelled, false), gte(calendarEvents.startsAt, from), lt(calendarEvents.startsAt, to)),
      with: { client: { columns: { slug: true, name: true } } },
      orderBy: [asc(calendarEvents.startsAt)],
    }),
    db
      .select({ id: deliverables.id, label: deliverables.label, title: deliverables.title, dueOn: deliverables.dueOn, projectSlug: projects.slug, projectName: projects.name })
      .from(deliverables)
      .innerJoin(projects, eq(projects.id, deliverables.projectId))
      .where(and(eq(projects.clientId, client.id), eq(deliverables.status, "pending"), gte(deliverables.dueOn, start), lt(deliverables.dueOn, end))),
    db
      .select({ id: tasks.id, title: tasks.title, dueOn: tasks.dueOn, cadence: tasks.cadence })
      .from(tasks)
      .where(and(eq(tasks.clientId, client.id), eq(tasks.status, "open"), gte(tasks.dueOn, start), lt(tasks.dueOn, end))),
    db.query.retainers.findMany({ where: and(eq(retainers.clientId, client.id), eq(retainers.status, "active")) }),
    db
      .select({ hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)` })
      .from(timeEntries)
      .where(and(eq(timeEntries.clientId, client.id), gte(timeEntries.occurredOn, `${today.slice(0, 7)}-01`))),
  ])

  const items: WeekItem[] = []
  for (const e of events) {
    const iso = isoDay(e.startsAt)
    const day = dayIndex(iso)
    if (day < 0) continue
    const mine = e.clientId === client.id
    items.push({
      kind: "event",
      id: e.id,
      day,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      title: e.title || "(untitled)",
      mine,
      who: mine ? null : e.client?.name ?? null,
      allDay: e.allDay,
      href: e.url || null,
      color: e.client ? clientColor(e.client.slug) : undefined,
    })
  }
  for (const d of dueDeliverables) {
    if (!d.dueOn) continue
    items.push({ kind: "due", id: `del:${d.id}`, day: dayIndex(d.dueOn), title: `${d.label}${d.title ? ` · ${d.title}` : ""} due`, flavour: "due", href: ROUTES.project(d.projectSlug) })
  }
  for (const t of dueTasks) {
    if (!t.dueOn) continue
    items.push({ kind: "due", id: `task:${t.id}`, day: dayIndex(t.dueOn), title: t.cadence !== "none" ? `${t.title} ↻` : `${t.title} due`, flavour: t.cadence !== "none" ? "repeat" : "due", href: ROUTES.task(t.id) })
  }
  // Retainer month-end, when it falls inside the week.
  if (activeRetainers.length) {
    const [y, m] = today.split("-").map(Number)
    const lastDay = isoDay(new Date(y, m, 0))
    const day = dayIndex(lastDay)
    if (day >= 0) {
      const cap = activeRetainers.reduce((s, r) => s + r.hoursPerMonth, 0)
      const unused = Math.max(0, cap - Number(monthHours[0]?.hours ?? 0))
      items.push({ kind: "due", id: "retainer:month-end", day, title: `Month end · ${unused % 1 ? unused.toFixed(1) : unused} h unused`, flavour: "money", href: ROUTES.retainer(activeRetainers[0].slug) })
    }
  }
  items.sort((a, b) => (a.day - b.day) || (a.kind === "due" ? -1 : b.kind === "due" ? 1 : a.startsAt < b.startsAt ? -1 : 1))
  // -1 when today is not in the shown week (the Calendar pages by ?week=).
  return { start, days, todayIndex: dayIndex(today), items }
}

/* ------------------------------------------------------------ signals */

export type SignalRow = {
  key: string
  kind: InboxKind | "approval" | "proposal"
  title: string
  age: string
  late: boolean
  href: string
  /** Set on the everyone view (the roster page); a client's own rooms leave it out. */
  client?: { slug: string; name: string; color: string }
}

export type SignalsData = { rows: SignalRow[]; total: number }

function ageLabel(ms: number) {
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return "now"
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/**
 * What is waiting on you for this client: inbox items that need a reply
 * (late ones first), parked agent writes, and proposals from meeting notes.
 * The same rule the Inbox room's "Needs you" lens uses.
 */
export async function loadSignals(client: ClientShell, now = new Date()): Promise<SignalsData> {
  const [inbox, approvals, notes] = await Promise.all([
    loadInbox(now).catch(() => null),
    approvalFacts().catch(() => []),
    notesForClient(client.id, 6).catch(() => []),
  ])
  const rows: SignalRow[] = []
  if (inbox) {
    for (const item of inbox.items) {
      if (item.clientSlug !== client.slug) continue
      if (item.state === "archived" || item.state === "snoozed") continue
      if (!item.needsReply) continue
      const late = item.kind === "ticket" && item.ageDays >= ATTENTION_RULES.ticketReplyDays[ticketPriority(item.priority ?? "normal")]
      rows.push({
        key: item.key,
        kind: item.kind,
        title: item.title,
        age: item.ageDays === 0 ? "today" : `${item.ageDays}d`,
        late,
        href: `${ROUTES.clientRoom(client.slug, "inbox")}?item=${encodeURIComponent(item.key)}`,
      })
    }
  }
  for (const a of approvals) {
    if (a.client?.slug !== client.slug) continue
    rows.push({ key: `approval:${a.callId}`, kind: "approval", title: approvalLine(a), age: ageLabel(now.getTime() - a.parkedAt.getTime()), late: false, href: a.href })
  }
  for (const note of notes) {
    if (note.items.proposed > 0) {
      rows.push({
        key: `proposal:${note.id}`,
        kind: "proposal",
        title: `${note.items.proposed} proposed from “${note.title}”`,
        age: note.startedAt ? ageLabel(now.getTime() - new Date(note.startedAt).getTime()) : "",
        late: false,
        href: ROUTES.meetingNote(note.id),
      })
    }
  }
  rows.sort((a, b) => Number(b.late) - Number(a.late))
  return { rows, total: rows.length }
}


/* ------------------------------------------------------------ everyone (the roster page) */

/**
 * The whole week across every client: each client's events in that client's
 * colour (marked `mine` with `who` = the client, so the grid labels them),
 * Karol's own blocks as "own", and every client's deadlines with the client
 * name in front.
 */
export async function loadWeekAll(now = new Date(), anchor?: string): Promise<WeekData> {
  const today = isoDay(now)
  const start = weekStart(anchor ?? today)
  const end = addDays(start, 7)
  const from = new Date(`${start}T00:00:00`)
  const to = new Date(`${end}T00:00:00`)
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i)
    return { iso, num: Number(iso.slice(8, 10)), dow: DOWS[i] }
  })
  const dayIndex = (iso: string) => days.findIndex((d) => d.iso === iso)

  const [events, dueDeliverables, dueTasks, activeRetainers, monthHours] = await Promise.all([
    db.query.calendarEvents.findMany({
      where: and(eq(calendarEvents.cancelled, false), gte(calendarEvents.startsAt, from), lt(calendarEvents.startsAt, to)),
      with: { client: { columns: { slug: true, name: true } } },
      orderBy: [asc(calendarEvents.startsAt)],
    }),
    db
      .select({ id: deliverables.id, label: deliverables.label, title: deliverables.title, dueOn: deliverables.dueOn, projectSlug: projects.slug, clientName: clients.name })
      .from(deliverables)
      .innerJoin(projects, eq(projects.id, deliverables.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(and(eq(deliverables.status, "pending"), gte(deliverables.dueOn, start), lt(deliverables.dueOn, end))),
    db
      .select({ id: tasks.id, title: tasks.title, dueOn: tasks.dueOn, cadence: tasks.cadence, clientName: clients.name })
      .from(tasks)
      .leftJoin(clients, eq(clients.id, tasks.clientId))
      .where(and(eq(tasks.status, "open"), gte(tasks.dueOn, start), lt(tasks.dueOn, end))),
    db.query.retainers.findMany({ where: eq(retainers.status, "active"), with: { client: { columns: { id: true, name: true, slug: true } } } }),
    db
      .select({ clientId: timeEntries.clientId, hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)` })
      .from(timeEntries)
      .where(gte(timeEntries.occurredOn, `${today.slice(0, 7)}-01`))
      .groupBy(timeEntries.clientId),
  ])

  const items: WeekItem[] = []
  for (const e of events) {
    const day = dayIndex(isoDay(e.startsAt))
    if (day < 0) continue
    items.push({
      kind: "event",
      id: e.id,
      day,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      title: e.title || "(untitled)",
      mine: !!e.client,
      who: e.client?.name ?? null,
      allDay: e.allDay,
      href: e.url || null,
      color: e.client ? clientColor(e.client.slug) : undefined,
    })
  }
  for (const d of dueDeliverables) {
    if (!d.dueOn) continue
    items.push({ kind: "due", id: `del:${d.id}`, day: dayIndex(d.dueOn), title: `${d.clientName} · ${d.label}${d.title ? ` · ${d.title}` : ""} due`, flavour: "due", href: ROUTES.project(d.projectSlug) })
  }
  for (const t of dueTasks) {
    if (!t.dueOn) continue
    const who = t.clientName ? `${t.clientName} · ` : ""
    items.push({ kind: "due", id: `task:${t.id}`, day: dayIndex(t.dueOn), title: t.cadence !== "none" ? `${who}${t.title} ↻` : `${who}${t.title} due`, flavour: t.cadence !== "none" ? "repeat" : "due", href: ROUTES.task(t.id) })
  }
  const [y, m] = today.split("-").map(Number)
  const lastDay = isoDay(new Date(y, m, 0))
  const monthEndDay = dayIndex(lastDay)
  if (monthEndDay >= 0) {
    const hoursByClient = new Map(monthHours.map((r) => [r.clientId, Number(r.hours)]))
    for (const r of activeRetainers) {
      if (!r.client) continue
      const unused = Math.max(0, r.hoursPerMonth - (hoursByClient.get(r.client.id) ?? 0))
      items.push({ kind: "due", id: `retainer:${r.id}`, day: monthEndDay, title: `${r.client.name} · month end · ${unused % 1 ? unused.toFixed(1) : unused} h unused`, flavour: "money", href: ROUTES.retainer(r.slug) })
    }
  }
  items.sort((a, b) => (a.day - b.day) || (a.kind === "due" ? -1 : b.kind === "due" ? 1 : a.startsAt < b.startsAt ? -1 : 1))
  return { start, days, todayIndex: dayIndex(today), items }
}

/** What is waiting on you across every client, each row carrying its client. */
export async function loadSignalsAll(now = new Date()): Promise<SignalsData> {
  const [inbox, approvals] = await Promise.all([loadInbox(now).catch(() => null), approvalFacts().catch(() => [])])
  const rows: SignalRow[] = []
  if (inbox) {
    const clientBySlug = new Map(inbox.clients.map((c) => [c.slug, c]))
    for (const item of inbox.items) {
      if (item.state === "archived" || item.state === "snoozed") continue
      if (!item.needsReply) continue
      const late = item.kind === "ticket" && item.ageDays >= ATTENTION_RULES.ticketReplyDays[ticketPriority(item.priority ?? "normal")]
      const c = item.clientSlug ? clientBySlug.get(item.clientSlug) : null
      rows.push({
        key: item.key,
        kind: item.kind,
        title: item.title,
        age: item.ageDays === 0 ? "today" : `${item.ageDays}d`,
        late,
        href: c ? `${ROUTES.clientRoom(c.slug, "inbox")}?item=${encodeURIComponent(item.key)}` : `${ROUTES.inbox}?item=${encodeURIComponent(item.key)}`,
        client: c ? { slug: c.slug, name: c.name, color: c.color } : undefined,
      })
    }
  }
  for (const a of approvals) {
    rows.push({
      key: `approval:${a.callId}`,
      kind: "approval",
      title: approvalLine(a),
      age: ageLabel(now.getTime() - a.parkedAt.getTime()),
      late: false,
      href: a.href,
      client: a.client ? { slug: a.client.slug, name: a.client.name, color: a.client.color } : undefined,
    })
  }
  rows.sort((a, b) => Number(b.late) - Number(a.late))
  return { rows, total: rows.length }
}

/* ------------------------------------------------------------ the board */

export type BoardData = { focus: FocusSet; week: WeekData; signals: SignalsData }

export async function loadBoard(client: ClientShell, now = new Date()): Promise<BoardData> {
  const [focus, week, signals] = await Promise.all([focusFor(client, now), loadWeek(client, now), loadSignals(client, now)])
  return { focus, week, signals }
}

export { isoDay, weekEnd }
