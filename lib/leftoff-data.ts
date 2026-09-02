import { randomUUID } from "node:crypto"
import { and, eq, gte, sql } from "drizzle-orm"
import { db } from "@/db"
import { sessionNotes, type SessionNote } from "@/db/schema"
import {
  BROWSER_REF,
  LEFTOFF_RULES,
  buildPayload,
  clip,
  eventState,
  projectFromCwd,
  type LeftOffEvent,
  type LeftOffPayload,
  type NoteFacts,
  type Surface,
} from "@/lib/leftoff"

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

  const inserted = await client.execute(sql`
    insert into session_notes
      (session_ref, surface, title, project, cwd, branch, last_prompt, last_reply,
       state, event_at, started_at, ended_at, meta)
    values
      (${sessionRef}, ${surface}, ${title}, ${project}, ${cwd}, ${branch}, ${prompt}, ${reply},
       ${state ?? "waiting"}, ${at}::timestamptz, ${at}::timestamptz, ${endedAt}::timestamptz, ${meta}::jsonb)
    on conflict (session_ref) do update set
      state        = coalesce(${state}::text, session_notes.state),
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

function facts(row: SessionNote): NoteFacts {
  return {
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

/** Everything the panel, the widget and the dashboard show. */
export async function loadLeftOff(now = new Date(), client: Executor = db): Promise<LeftOffPayload> {
  const since = new Date(now.getTime() - LEFTOFF_RULES.purgeAfterDays * 86_400_000)
  const rows = await client.query.sessionNotes.findMany({
    where: gte(sessionNotes.eventAt, since),
    orderBy: (t, { desc }) => desc(t.eventAt),
    limit: 200,
  })
  const live = rows.filter((r) => r.pinned || r.body !== "" || !r.dismissedAt)
  return buildPayload(live.map(facts), now)
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
    .set({ state: "gone", endedAt: sql`event_at`, updatedAt: now })
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
