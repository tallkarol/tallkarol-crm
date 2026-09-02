import { randomUUID } from "node:crypto"
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  agentSessions,
  clients,
  notificationLog,
  sessionNotes,
  supportTickets,
  type SessionNote,
} from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import {
  BROWSER_REF,
  LEFTOFF_RULES,
  buildBriefing,
  buildPayload,
  clip,
  eventState,
  localDay,
  projectFromCwd,
  type Briefing,
  type LeftOffClient,
  type LeftOffEvent,
  type LeftOffPayload,
  type NoteFacts,
  type Surface,
} from "@/lib/leftoff"
import { notify } from "@/lib/notify"
import { ROUTES } from "@/lib/nav"
import { createTicket } from "@/lib/tickets"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"
import { workspaceTimezone } from "@/lib/timezone"

/**
 * Where I left off — the db half. Every hook on every chat posts here, seven
 * or eight at a time, and Stop / UserPromptSubmit can cross on the network,
 * so the upsert only applies when the event is strictly newer than the one
 * already on the row. A retried duplicate is equal, not newer, and is
 * dropped too. Fields an event does not carry (`NULLIF … ''`) never blank the
 * stored ones. `body` / `pinned` are what you said on purpose, not what a
 * hook observed — they are written outside the guard so a post-it can never
 * lose to a stale hook.
 */

export type IncomingNote = {
  sessionRef: string | null
  surface: Surface
  event: LeftOffEvent
  at: Date
  cwd?: string
  branch?: string
  title?: string
  prompt?: string
  reply?: string
  body?: string
  pinned?: boolean
  meta?: Record<string, unknown>
  /** The repo's `.claude/client` slug, resolved by the hook. */
  client?: string
  blockedOn?: string
}

export type RecordResult = { sessionRef: string; applied: boolean; state: string | null }

/**
 * Every function takes the executor so `check:leftoff:db` can run the real
 * SQL inside one transaction (create the table, exercise the guard, roll
 * back) against a database that does not have the table yet.
 */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

function notificationType(meta: Record<string, unknown> | undefined) {
  const v = meta?.notification_type ?? meta?.notificationType
  return typeof v === "string" ? v : null
}

export async function recordNote(note: IncomingNote, client: Executor = db): Promise<RecordResult> {
  const isManual = note.event === "note"
  const sessionRef =
    note.sessionRef?.trim() ||
    (note.event === "snapshot" ? BROWSER_REF : isManual ? `manual:${randomUUID()}` : "")
  if (!sessionRef) throw new Error("`sessionRef` is required.")

  const surface: Surface =
    sessionRef === BROWSER_REF ? "browser" : sessionRef.startsWith("manual:") ? "manual" : note.surface
  const state = eventState(note.event, notificationType(note.meta))
  const cwd = (note.cwd ?? "").trim().slice(0, 500)
  const branch = (note.branch ?? "").trim().slice(0, 200)
  const title = clip(note.title ?? "", 200)
  const project = cwd ? projectFromCwd(cwd) : ""
  const prompt = clip(note.prompt ?? "")
  const reply = clip(note.reply ?? "")
  const meta = JSON.stringify(note.meta && typeof note.meta === "object" ? note.meta : {})
  const at = note.at.toISOString()
  const endedAt = state === "gone" ? at : null
  const clientId = await clientIdForSlug(note.client, client)
  // Only a blocked event carries what it is blocked on; anything else clears it.
  const blockedOn = state === "blocked" ? clip(note.blockedOn ?? "", 300) : state ? "" : null

  const inserted = await client.execute(sql`
    insert into session_notes
      (session_ref, surface, title, project, cwd, branch, last_prompt, last_reply,
       state, event_at, started_at, ended_at, meta, client_id, blocked_on)
    values
      (${sessionRef}, ${surface}, ${title}, ${project}, ${cwd}, ${branch}, ${prompt}, ${reply},
       ${state ?? "waiting"}, ${at}::timestamptz, ${at}::timestamptz, ${endedAt}::timestamptz, ${meta}::jsonb,
       ${clientId}::uuid, ${blockedOn ?? ""})
    on conflict (session_ref) do update set
      state        = coalesce(${state}::text, session_notes.state),
      client_id    = coalesce(excluded.client_id, session_notes.client_id),
      blocked_on   = coalesce(${blockedOn}::text, session_notes.blocked_on),
      title        = coalesce(nullif(excluded.title, ''),       session_notes.title),
      project      = coalesce(nullif(excluded.project, ''),     session_notes.project),
      cwd          = coalesce(nullif(excluded.cwd, ''),         session_notes.cwd),
      branch       = coalesce(nullif(excluded.branch, ''),      session_notes.branch),
      last_prompt  = coalesce(nullif(excluded.last_prompt, ''), session_notes.last_prompt),
      last_reply   = coalesce(nullif(excluded.last_reply, ''),  session_notes.last_reply),
      event_at     = excluded.event_at,
      started_at   = coalesce(session_notes.started_at, excluded.started_at),
      ended_at     = case
                       when ${state}::text = 'gone' then excluded.event_at
                       when ${state}::text is null then session_notes.ended_at
                       else null
                     end,
      dismissed_at = case when ${state}::text = 'working' then null else session_notes.dismissed_at end,
      meta         = session_notes.meta || excluded.meta,
      updated_at   = now()
    where excluded.event_at > session_notes.event_at
    returning state
  `)
  const applied = inserted.length > 0

  if (isManual) {
    const body = (note.body ?? "").trim().slice(0, LEFTOFF_RULES.maxBody)
    const firstLine = clip(body.split("\n")[0] ?? "", 80)
    await client.execute(sql`
      update session_notes set
        body         = ${body},
        pinned       = ${note.pinned ?? true},
        title        = case when title = '' then ${firstLine} else title end,
        dismissed_at = null,
        updated_at   = now()
      where session_ref = ${sessionRef}
    `)
  } else if (typeof note.pinned === "boolean") {
    await client
      .update(sessionNotes)
      .set({ pinned: note.pinned, updatedAt: new Date() })
      .where(eq(sessionNotes.sessionRef, sessionRef))
  }

  return { sessionRef, applied, state }
}

export async function dismissNote(sessionRef: string, now = new Date(), client: Executor = db) {
  const rows = await client
    .update(sessionNotes)
    .set({ dismissedAt: now, updatedAt: now })
    .where(eq(sessionNotes.sessionRef, sessionRef))
    .returning({ id: sessionNotes.id })
  return rows.length > 0
}

export async function pinNote(sessionRef: string, pinned: boolean, now = new Date(), client: Executor = db) {
  const rows = await client
    .update(sessionNotes)
    .set({ pinned, updatedAt: now })
    .where(eq(sessionNotes.sessionRef, sessionRef))
    .returning({ id: sessionNotes.id })
  return rows.length > 0
}

const slugCache = new Map<string, string | null>()

async function clientIdForSlug(slug: string | undefined, client: Executor): Promise<string | null> {
  const key = (slug ?? "").trim().toLowerCase()
  if (!key) return null
  if (slugCache.has(key)) return slugCache.get(key) ?? null
  const row = await client.query.clients.findFirst({ where: eq(clients.slug, key), columns: { id: true } })
  slugCache.set(key, row?.id ?? null)
  return row?.id ?? null
}

type ClientLite = { slug: string; name: string } | null

function facts(row: SessionNote, clientRow?: ClientLite): NoteFacts {
  const c: LeftOffClient | null = clientRow
    ? { slug: clientRow.slug, name: clientRow.name, color: clientColor(clientRow.slug) }
    : null
  return {
    blockedOn: row.blockedOn,
    reply: row.reply,
    taskId: row.taskId,
    ticketId: row.ticketId,
    client: c,
    sessionRef: row.sessionRef,
    surface: row.surface,
    title: row.title,
    project: row.project,
    cwd: row.cwd,
    branch: row.branch,
    lastPrompt: row.lastPrompt,
    lastReply: row.lastReply,
    state: row.state,
    body: row.body,
    pinned: row.pinned,
    eventAt: row.eventAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    dismissedAt: row.dismissedAt,
    meta: (row.meta ?? {}) as Record<string, unknown>,
  }
}

/**
 * Rows with their client: the note's own `client_id` (from the repo pin),
 * else whatever `agent_sessions` knows for the same session — the punch-list
 * and meter side resolves clients too, and the two must not disagree.
 */
export async function loadNoteFacts(now: Date, client: Executor = db): Promise<NoteFacts[]> {
  await ensureClientColors().catch(() => ({}))
  const since = new Date(now.getTime() - LEFTOFF_RULES.purgeAfterDays * 86_400_000)
  const rows = await client
    .select({
      note: sessionNotes,
      ownSlug: clients.slug,
      ownName: clients.name,
      viaSessionId: agentSessions.clientId,
    })
    .from(sessionNotes)
    .leftJoin(clients, eq(clients.id, sessionNotes.clientId))
    .leftJoin(agentSessions, eq(agentSessions.sessionRef, sessionNotes.sessionRef))
    .where(gte(sessionNotes.eventAt, since))
    .orderBy(desc(sessionNotes.eventAt))
    .limit(200)

  const missing = Array.from(
    new Set(rows.filter((r) => !r.ownSlug && r.viaSessionId).map((r) => r.viaSessionId as string))
  )
  const fallback = new Map<string, ClientLite>()
  if (missing.length) {
    const found = await client.query.clients.findMany({
      where: (c, { inArray }) => inArray(c.id, missing),
      columns: { id: true, slug: true, name: true },
    })
    for (const c of found) fallback.set(c.id, { slug: c.slug, name: c.name })
  }

  return rows.map((r) =>
    facts(
      r.note,
      r.ownSlug ? { slug: r.ownSlug, name: r.ownName ?? r.ownSlug } : fallback.get(r.viaSessionId ?? "") ?? null
    )
  )
}

export async function loadLeftOff(now = new Date(), client: Executor = db): Promise<LeftOffPayload> {
  const all = await loadNoteFacts(now, client)
  const live = all.filter((r) => r.pinned || r.body !== "" || !r.dismissedAt)
  return buildPayload(live, now)
}

/* ------------------------------------------------------------- reply queue */

/** Leave a reply for a chat; its own hooks deliver it at the next turn. */
export async function queueReply(sessionRef: string, text: string, now = new Date(), client: Executor = db) {
  const body = text.trim().slice(0, LEFTOFF_RULES.maxBody)
  const rows = await client
    .update(sessionNotes)
    .set({ reply: body, replyAt: body ? now : null, updatedAt: now })
    .where(eq(sessionNotes.sessionRef, sessionRef))
    .returning({ id: sessionNotes.id })
  return rows.length > 0
}

/** Read a queued reply; with `take` it is cleared in the same statement, so it cannot be delivered twice. */
export async function readReply(sessionRef: string, take: boolean, client: Executor = db): Promise<string> {
  if (!take) {
    const row = await client.query.sessionNotes.findFirst({
      where: eq(sessionNotes.sessionRef, sessionRef),
      columns: { reply: true },
    })
    return row?.reply ?? ""
  }
  const rows = (await client.execute(sql`
    with old as (select reply from session_notes where session_ref = ${sessionRef})
    update session_notes
       set reply = '', reply_at = null, updated_at = now()
     where session_ref = ${sessionRef} and reply <> ''
    returning (select reply from old) as reply
  `)) as unknown as { reply: string }[]
  return rows.length ? rows[0].reply : ""
}

/* ---------------------------------------------------------------- convert */

export type ConvertResult =
  | { ok: true; taskId?: string; ticketId?: string; url: string }
  | { ok: false; error: string }

function resumeNotes(n: NoteFacts) {
  const lines: string[] = []
  if (n.cwd) lines.push(`Workspace: ${n.cwd}${n.branch ? ` (${n.branch})` : ""}`)
  if (n.surface === "claude") {
    lines.push(`Resume: cd '${n.cwd.replace(/'/g, "'\\''")}' && claude --resume ${n.sessionRef}`)
  } else if (n.surface === "cursor") {
    lines.push(`Cursor chat ${n.sessionRef.replace(/^cursor:/, "")}`)
  }
  if (n.blockedOn) lines.push(`Was blocked on: ${n.blockedOn}`)
  if (n.lastPrompt) lines.push(`Last asked: ${n.lastPrompt}`)
  if (n.lastReply) lines.push(`Last reply: ${n.lastReply}`)
  if (n.body) lines.push(`Note: ${n.body}`)
  return lines.join("\n")
}

/**
 * A parked chat you will not get back to today becomes a task (or, when it
 * is a client problem, a ticket) carrying everything needed to pick the
 * thread up: the resume command, what was asked, what was answered. The note
 * is dismissed afterwards and remembers what it became.
 */
export async function convertNote(
  sessionRef: string,
  to: "task" | "ticket",
  userId: string | null,
  now = new Date()
): Promise<ConvertResult> {
  const all = await loadNoteFacts(now)
  const n = all.find((f) => f.sessionRef === sessionRef)
  if (!n) return { ok: false, error: "No such note." }
  if (to === "task" && n.taskId) return { ok: true, taskId: n.taskId, url: `${ROUTES.tasks}?peek=task:${n.taskId}` }
  if (to === "ticket" && n.ticketId) {
    const existing = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, n.ticketId),
      columns: { number: true },
    })
    return { ok: true, ticketId: n.ticketId, url: existing ? `${ROUTES.support}/${existing.number}` : ROUTES.support }
  }

  const clientRow = n.client
    ? await db.query.clients.findFirst({ where: eq(clients.slug, n.client.slug), columns: { id: true, slug: true } })
    : null
  const title = clip(n.title || n.body || n.lastPrompt || n.project || "Pick up where I left off", 200)

  if (to === "task") {
    const target = await resolveTaskTarget({ clientId: clientRow?.id ?? null })
    if ("error" in target) return { ok: false, error: target.error }
    const id = await insertTaskRow(db, {
      title,
      userId,
      target,
      priority: n.blockedOn ? 1 : 2,
      notes: resumeNotes(n),
      labels: ["left off"],
      source: "leftoff",
    })
    await db
      .update(sessionNotes)
      .set({ taskId: id, dismissedAt: now, updatedAt: now })
      .where(eq(sessionNotes.sessionRef, sessionRef))
    return { ok: true, taskId: id, url: `${ROUTES.tasks}?peek=task:${id}` }
  }

  const ticket = await createTicket({
    source: "leftoff",
    externalId: `leftoff:${sessionRef}`,
    clientId: clientRow?.id ?? null,
    clientSlug: clientRow?.slug ?? null,
    title,
    description: resumeNotes(n),
    kind: "request",
    priority: n.blockedOn ? "high" : "normal",
    tags: ["left off"],
    submittedBy: "Where I left off",
    raw: { sessionRef, surface: n.surface },
  })
  await db
    .update(sessionNotes)
    .set({ ticketId: ticket.id, dismissedAt: now, updatedAt: now })
    .where(eq(sessionNotes.sessionRef, sessionRef))
  return { ok: true, ticketId: ticket.id, url: `${ROUTES.support}/${ticket.number}` }
}

/* --------------------------------------------------------------- briefing */

export type BriefingResult = Briefing & { day: string; sent: boolean; since: string }

/**
 * What happened while you were away. The window starts at the last briefing
 * actually sent (else 12 h ago, never more than 36 h back). Sent once per
 * workspace-local day: the Mac asks on the first unlock, the cron asks at
 * 07:30 as a fallback, and the notification log's (kind, day) dedupe makes
 * whichever comes second a no-op.
 */
export async function buildBriefingNow(now = new Date()): Promise<Omit<BriefingResult, "sent">> {
  const tz = await workspaceTimezone()
  const day = localDay(now, tz)
  const last = await db.query.notificationLog.findFirst({
    where: and(eq(notificationLog.kind, "leftoff.briefing"), eq(notificationLog.seeded, false)),
    orderBy: desc(notificationLog.sentAt),
    columns: { sentAt: true },
  })
  const floor = now.getTime() - 36 * 3_600_000
  const since = new Date(Math.max(floor, last ? last.sentAt.getTime() : now.getTime() - 12 * 3_600_000))

  const [notes, finished, tickets] = await Promise.all([
    loadNoteFacts(now),
    db
      .select({ sessionRef: agentSessions.sessionRef, name: agentSessions.name, clientName: clients.name })
      .from(agentSessions)
      .leftJoin(clients, eq(clients.id, agentSessions.clientId))
      .where(gte(agentSessions.endedAt, since))
      .limit(50),
    db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(gte(supportTickets.createdAt, since))
      .limit(100),
  ])
  const briefing = buildBriefing({
    now,
    since,
    notes,
    finishedSessions: finished.map((f) => ({ sessionRef: f.sessionRef, name: f.name, client: f.clientName ?? "" })),
    newTickets: tickets.length,
  })
  return { ...briefing, day, since: since.toISOString() }
}

export async function sendBriefing(now = new Date()): Promise<BriefingResult> {
  const b = await buildBriefingNow(now)
  if (!b.lines.length) return { ...b, sent: false }
  const result = await notify({
    kind: "leftoff.briefing",
    dedupeKey: b.day,
    title: b.title,
    body: `${b.body} — ${b.lines.join(" · ")}`.slice(0, 400),
    url: "/",
    now,
  }).catch(() => "unsent" as const)
  return { ...b, sent: result === "sent" }
}

/**
 * Housekeeping for `tick()`: a chat nobody has heard from in a day is
 * presumed gone (its laptop died before SessionEnd could fire); hidden rows
 * are deleted after two weeks. Pinned and hand-written notes are never
 * touched.
 */
export async function sweepSessionNotes(now = new Date(), client: Executor = db) {
  const goneBefore = new Date(now.getTime() - LEFTOFF_RULES.presumedGoneHours * 3_600_000)
  const purgeBefore = new Date(now.getTime() - LEFTOFF_RULES.purgeAfterDays * 86_400_000)

  const presumed = await client
    .update(sessionNotes)
    .set({ state: "gone", endedAt: sql`event_at`, meta: sql`meta || '{"presumed": true}'::jsonb`, updatedAt: now })
    .where(
      and(
        sql`${sessionNotes.state} <> 'gone'`,
        sql`${sessionNotes.surface} in ('claude', 'cursor')`,
        sql`${sessionNotes.eventAt} < ${goneBefore.toISOString()}::timestamptz`
      )
    )
    .returning({ id: sessionNotes.id })

  const purged = await client
    .delete(sessionNotes)
    .where(
      and(
        eq(sessionNotes.pinned, false),
        eq(sessionNotes.body, ""),
        sql`(${sessionNotes.dismissedAt} < ${purgeBefore.toISOString()}::timestamptz
             or (${sessionNotes.state} = 'gone' and ${sessionNotes.endedAt} < ${purgeBefore.toISOString()}::timestamptz))`
      )
    )
    .returning({ id: sessionNotes.id })

  return { presumedGone: presumed.length, purged: purged.length }
}
