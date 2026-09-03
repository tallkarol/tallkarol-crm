import { randomUUID } from "node:crypto"
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  agentSessions,
  clients,
  notificationLog,
  sessionMessages,
  sessionNotes,
  supportTickets,
  type SessionNote,
} from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import {
  BROWSER_REF,
  isBrowserRef,
  isRepoRef,
  LEFTOFF_RULES,
  buildBriefing,
  buildPayload,
  clip,
  eventState,
  keepsMessages,
  localDay,
  messageRole,
  messageText,
  projectFromCwd,
  readHandoff,
  type AgentEvent,
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
  /** A subagent starting or stopping under this chat, or `clear` at session end. */
  agent?: AgentEvent
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

  const surface: Surface = isBrowserRef(sessionRef)
    ? "browser"
    : isRepoRef(sessionRef)
      ? "repo"
      : sessionRef.startsWith("manual:")
        ? "manual"
        : sessionRef.startsWith("agent:")
          ? "agent"
          : note.surface
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
      meta         = case
                       when ${state}::text = 'working' then (session_notes.meta - 'handoff') || excluded.meta
                       else session_notes.meta || excluded.meta
                     end,
      updated_at   = now()
    where excluded.event_at > session_notes.event_at
    returning state
  `)
  const applied = inserted.length > 0

  // A repo row is only interesting while the working copy is dirty. The sweep
  // reports every repo it knows, clean ones included, so the row is dismissed
  // the moment the work is committed and comes back the moment it is not.
  if (surface === "repo") {
    const m = (note.meta ?? {}) as Record<string, unknown>
    const count = (k: string) => (typeof m[k] === "number" && Number.isFinite(m[k] as number) ? (m[k] as number) : 0)
    // Only a post that actually carries the counts may clear a row. A partial
    // post — one that just enriches the meta — must never empty the board.
    const reportsCounts = typeof m.changed === "number" || typeof m.untracked === "number"
    const clean = reportsCounts && count("changed") + count("untracked") <= 0
    await client.execute(sql`
      update session_notes
         set dismissed_at = ${clean ? sql`now()` : sql`null`}, updated_at = now()
       where session_ref = ${sessionRef}
         and (dismissed_at is null) = ${clean}
    `)
  }

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

  // The post-it is the point of the turn, so it must not be collateral damage
  // when the guard drops the Stop — a SubagentStop landing in the same
  // millisecond is enough. Re-applied outside the guard, but never from an
  // event OLDER than the row: a genuinely stale Stop still loses.
  const handoff = readHandoff((note.meta ?? {}) as Record<string, unknown>)
  if (handoff && !applied) {
    await client.execute(sql`
      update session_notes set
        meta = meta || jsonb_build_object('handoff', ${JSON.stringify(handoff)}::jsonb),
        updated_at = now()
      where session_ref = ${sessionRef} and event_at <= ${at}::timestamptz`)
  }

  if (note.agent) await applyAgentEvent(sessionRef, note.agent, at, client)

  // What was said outlives the note. Written whether or not the guard applied
  // the upsert: a Stop that lost a millisecond race to a SubagentStop still
  // carries the reply, and losing it would put a hole in the history.
  if (keepsMessages(surface)) {
    const text = messageText(note.event, note.prompt ?? "", note.reply ?? "")
    const role = messageRole(note.event)
    // History must never cost the board a note. If this half fails — the
    // table is not migrated yet, the write races — the row above still stands
    // and the hook still returns in time.
    try {
      if (role && text) {
        await client
          .insert(sessionMessages)
          .values({ sessionRef, surface, role, at: note.at, text, origin: "hook" })
          .onConflictDoNothing()
      }
      if (state === "gone") await ensureAgentSession(sessionRef, note.at, client)
    } catch (err) {
      console.error("leftoff: kept the note, lost the history:", err)
    }
  }

  return { sessionRef, applied, state }
}

/**
 * Every conversation that ends gets a row in `agent_sessions`, even one the
 * summarizer never reached (an unassigned chat, a crashed Mac, a Cursor chat
 * that has no summarizer at all). Without this, history could only show the
 * sessions that happened to be billable. Never touches `summary` or
 * `highlights` — those belong to `session-log`, and an empty one must not
 * overwrite a written one.
 */
export async function ensureAgentSession(sessionRef: string, endedAt: Date, client: Executor = db) {
  await client.execute(sql`
    insert into agent_sessions (session_ref, surface, name, client_id, cwd, started_at, ended_at)
    select n.session_ref, n.surface, left(n.title, 300), n.client_id, left(n.cwd, 500),
           n.started_at, coalesce(n.ended_at, ${endedAt.toISOString()}::timestamptz)
    from session_notes n
    where n.session_ref = ${sessionRef}
    on conflict (session_ref) do update set
      name       = case when excluded.name = '' then agent_sessions.name else excluded.name end,
      client_id  = coalesce(agent_sessions.client_id, excluded.client_id),
      cwd        = case when excluded.cwd = '' then agent_sessions.cwd else excluded.cwd end,
      started_at = coalesce(agent_sessions.started_at, excluded.started_at),
      ended_at   = coalesce(excluded.ended_at, agent_sessions.ended_at),
      updated_at = now()
  `)
}

/**
 * The set of subagents running under a chat, kept in `meta.agents` as
 * `{ <agent_id>: { type, since, description? } }`. Written OUTSIDE the
 * event_at guard on purpose: three agents spawned by one message start in the
 * same millisecond, and the guard would drop all but the first touch. Adding
 * and removing distinct keys commute, so order and duplicates do not matter.
 * `jsonb_set` is never used — it is a no-op when the parent key is missing.
 */
async function applyAgentEvent(sessionRef: string, ev: AgentEvent, at: string, client: Executor) {
  if (ev.op === "clear") {
    await client.execute(sql`
      update session_notes set meta = meta - 'agents', updated_at = now()
      where session_ref = ${sessionRef}`)
    return
  }
  const id = ev.id.trim().slice(0, 100)
  if (!id) return
  if (ev.op === "start") {
    const entry = JSON.stringify({
      type: ev.type.trim().slice(0, 100) || "agent",
      since: at,
      ...(ev.description ? { description: clip(ev.description, 200) } : {}),
    })
    await client.execute(sql`
      update session_notes set
        meta = meta || jsonb_build_object('agents',
                 coalesce(meta->'agents', '{}'::jsonb) || jsonb_build_object(${id}::text, ${entry}::jsonb)),
        updated_at = now()
      where session_ref = ${sessionRef}`)
    return
  }
  await client.execute(sql`
    update session_notes set
      meta = meta || jsonb_build_object('agents', coalesce(meta->'agents', '{}'::jsonb) - ${id}::text),
      updated_at = now()
    where session_ref = ${sessionRef}`)
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
  const since = new Date(now.getTime() - LEFTOFF_RULES.boardWindowDays * 86_400_000)
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
  const h = readHandoff(n.meta)
  if (h?.done) lines.push(`Done: ${h.done}`)
  if (h?.blocked) lines.push(`Blocked on: ${h.blocked}`)
  if (h?.next) lines.push(`Next: ${h.next}`)
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
 * Housekeeping for `tick()`: a chat nobody has heard from in a day is presumed
 * gone (its laptop died before SessionEnd could fire), and gets its
 * `agent_sessions` row so it still appears in history.
 *
 * Nothing is deleted. Notes used to be purged after two weeks, which is what
 * made "what was I doing on Tuesday" unanswerable; they now simply fall out of
 * the board's `boardWindowDays` read window and stay as history.
 */
export async function sweepSessionNotes(now = new Date(), client: Executor = db) {
  const goneBefore = new Date(now.getTime() - LEFTOFF_RULES.presumedGoneHours * 3_600_000)

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
    .returning({
      sessionRef: sessionNotes.sessionRef,
      surface: sessionNotes.surface,
      title: sessionNotes.title,
      clientId: sessionNotes.clientId,
      cwd: sessionNotes.cwd,
      startedAt: sessionNotes.startedAt,
      endedAt: sessionNotes.endedAt,
    })

  for (const row of presumed) {
    await ensureAgentSession(row.sessionRef, row.endedAt ?? now, client).catch(() => {})
  }

  return { presumedGone: presumed.length, purged: 0 }
}
