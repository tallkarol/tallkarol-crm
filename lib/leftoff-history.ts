import { sql } from "drizzle-orm"
import { db } from "@/db"
import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import {
  LEFTOFF_RULES,
  deriveState,
  localDay,
  resumeCommand,
  type LeftOffClient,
  type NoteFacts,
  type NoteState,
} from "@/lib/leftoff"
import type { Executor } from "@/lib/leftoff-data"

/**
 * Session history — the board read backwards.
 *
 * The board answers "what is waiting on me right now" from `session_notes`,
 * which each chat overwrites and which only reaches back `boardWindowDays`.
 * This file answers "what did I do on Tuesday" and "where did I say that",
 * from those same rows plus `agent_sessions` (the durable record, summary
 * included) and `session_messages` (what was actually said).
 *
 * A session appears here if either table knows it, so a chat that ended before
 * anything summarised it is still history, and a summarised one whose note has
 * long scrolled off the board still shows its last exchange.
 */

/** Marks `ts_headline` puts around a hit. Control characters: no prose has them, so nothing has to be escaped and the page renders text, never HTML. */
const SEL_START = "\u0001"
const SEL_STOP = "\u0002"
const HEADLINE_OPTS = `MaxFragments=2, MaxWords=24, MinWords=8, FragmentDelimiter= … , StartSel=${SEL_START}, StopSel=${SEL_STOP}`

export type SnippetPart = { text: string; hit: boolean }

export type SessionHistoryRow = {
  sessionRef: string
  surface: string
  title: string
  project: string
  cwd: string
  branch: string
  /** Derived exactly as the board derives it; a session whose note is gone reads `gone`. */
  state: NoteState
  lastPrompt: string
  lastReply: string
  body: string
  summary: string
  highlights: string[]
  startedAt: string | null
  endedAt: string | null
  /** What this session sorts and groups by — its last sign of life. */
  at: string
  messageCount: number
  client: LeftOffClient | null
  taskId: string | null
  ticketId: string | null
  hasNote: boolean
  presumed: boolean
  resumeCommand: string
  openPath: string
}

export type SessionSearchHit = { role: string; at: string; snippet: SnippetPart[] }
export type SessionSearchResult = SessionHistoryRow & { hits: SessionSearchHit[]; matchedTitle: boolean }
export type SessionDay = { day: string; label: string; sessions: SessionHistoryRow[] }

type Row = Record<string, unknown>

function str(v: unknown) {
  return typeof v === "string" ? v : ""
}

function iso(v: unknown): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Split a headline into plain and matched runs, so the page can mark hits without HTML. */
export function parseSnippet(raw: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let rest = raw
  while (rest.length) {
    const open = rest.indexOf(SEL_START)
    if (open === -1) {
      parts.push({ text: rest, hit: false })
      break
    }
    if (open > 0) parts.push({ text: rest.slice(0, open), hit: false })
    const close = rest.indexOf(SEL_STOP, open)
    if (close === -1) {
      parts.push({ text: rest.slice(open + 1), hit: false })
      break
    }
    parts.push({ text: rest.slice(open + 1, close), hit: true })
    rest = rest.slice(close + 1)
  }
  return parts.filter((p) => p.text !== "")
}

function toRow(r: Row, now: Date): SessionHistoryRow {
  const sessionRef = str(r.session_ref)
  const surface = str(r.surface) || "claude"
  const cwd = str(r.cwd)
  const hasNote = r.note_state != null
  const facts = {
    surface,
    state: str(r.note_state) || "gone",
    eventAt: new Date(iso(r.event_at) ?? iso(r.at) ?? now.toISOString()),
  } as NoteFacts
  const slug = str(r.client_slug)
  return {
    sessionRef,
    surface,
    title: str(r.title),
    project: str(r.project),
    cwd,
    branch: str(r.branch),
    state: hasNote ? deriveState(facts, now) : "gone",
    lastPrompt: str(r.last_prompt),
    lastReply: str(r.last_reply),
    body: str(r.body),
    summary: str(r.summary),
    highlights: Array.isArray(r.highlights) ? (r.highlights as string[]) : [],
    startedAt: iso(r.started_at),
    endedAt: iso(r.ended_at),
    at: iso(r.at) ?? now.toISOString(),
    messageCount: Number(r.message_count ?? 0),
    client: slug ? { slug, name: str(r.client_name) || slug, color: clientColor(slug) } : null,
    taskId: r.task_id ? String(r.task_id) : null,
    ticketId: r.ticket_id ? String(r.ticket_id) : null,
    hasNote,
    presumed: r.presumed === true,
    resumeCommand: resumeCommand({ sessionRef, surface, cwd }),
    openPath: cwd,
  }
}

/**
 * One row per conversation, from all three tables at once. The union of refs
 * is the point: none of them is complete on its own — a chat can have a note
 * and no summary, a summary and no note, or (after the transcript backfill)
 * nothing but the messages themselves. The lateral count is an index range
 * scan per session rather than an aggregate over every message there is.
 */
const SELECT_SESSIONS = sql`
  select
    r.session_ref                                                as session_ref,
    coalesce(nullif(n.surface, ''), a.surface, 'claude')         as surface,
    coalesce(nullif(n.title, ''), nullif(a.name, ''), '')        as title,
    coalesce(n.project, '')                                      as project,
    coalesce(nullif(n.cwd, ''), a.cwd, '')                       as cwd,
    coalesce(n.branch, '')                                       as branch,
    n.state                                                      as note_state,
    n.event_at                                                   as event_at,
    coalesce(n.last_prompt, '')                                  as last_prompt,
    coalesce(n.last_reply, '')                                   as last_reply,
    coalesce(n.body, '')                                         as body,
    coalesce(a.summary, '')                                      as summary,
    coalesce(a.highlights, '[]'::jsonb)                          as highlights,
    coalesce(n.started_at, a.started_at, m.first_at)             as started_at,
    coalesce(a.ended_at, n.ended_at, m.last_at)                  as ended_at,
    coalesce(m.message_count, 0)                                 as message_count,
    n.task_id                                                    as task_id,
    n.ticket_id                                                  as ticket_id,
    (n.meta -> 'presumed') = 'true'::jsonb                       as presumed,
    c.slug                                                       as client_slug,
    c.name                                                       as client_name,
    greatest(
      coalesce(n.event_at,   to_timestamp(0)),
      coalesce(a.ended_at,   to_timestamp(0)),
      coalesce(a.started_at, to_timestamp(0)),
      coalesce(m.last_at,    to_timestamp(0))
    )                                                            as at
  from (
    select session_ref from session_notes
    union
    select session_ref from agent_sessions
    union
    select session_ref from session_messages
  ) r
  left join session_notes n   on n.session_ref = r.session_ref
  left join agent_sessions a  on a.session_ref = r.session_ref
  left join lateral (
    select count(*)::int as message_count, min(sm.at) as first_at, max(sm.at) as last_at
    from session_messages sm
    where sm.session_ref = r.session_ref
  ) m on true
  left join clients c on c.id = coalesce(n.client_id, a.client_id)
  where coalesce(nullif(n.surface, ''), a.surface, 'claude') not in ('manual', 'browser')
`

export type HistoryFilters = {
  from?: Date | null
  to?: Date | null
  clientSlug?: string | null
  surface?: string | null
  limit?: number
}

export async function listSessionHistory(
  filters: HistoryFilters = {},
  now = new Date(),
  client: Executor = db
): Promise<SessionHistoryRow[]> {
  await ensureClientColors().catch(() => ({}))
  const limit = Math.min(Math.max(filters.limit ?? 300, 1), 1000)
  const from = filters.from?.toISOString() ?? null
  const to = filters.to?.toISOString() ?? null
  const slug = filters.clientSlug ?? null
  const surface = filters.surface ?? null
  const rows = (await client.execute(sql`
    select * from (${SELECT_SESSIONS}) s
    where (${from}::timestamptz is null or s.at >= ${from}::timestamptz)
      and (${to}::timestamptz is null or s.at < ${to}::timestamptz)
      and (${slug}::text is null or s.client_slug = ${slug}::text)
      and (${surface}::text is null or s.surface = ${surface}::text)
    order by s.at desc
    limit ${limit}
  `)) as unknown as Row[]
  return rows.map((r) => toRow(r, now))
}

/** Newest day first, in the workspace's own zone — the same day the briefing uses. */
export function groupByDay(rows: SessionHistoryRow[], timeZone: string, now: Date): SessionDay[] {
  const today = localDay(now, timeZone)
  const yesterday = localDay(new Date(now.getTime() - 86_400_000), timeZone)
  const days = new Map<string, SessionHistoryRow[]>()
  for (const row of rows) {
    const day = localDay(new Date(row.at), timeZone)
    const list = days.get(day)
    if (list) list.push(row)
    else days.set(day, [row])
  }
  return Array.from(days.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, sessions]) => ({
      day,
      label: day === today ? "Today" : day === yesterday ? "Yesterday" : dayLabel(day),
      sessions,
    }))
}

function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

/**
 * Search every prompt and reply ever stored, and the titles and summaries too.
 * Postgres does the matching, the ranking and the snippets; each session
 * carries the lines that matched, so the answer is readable without opening
 * anything. The title pass is not a nicety — a stop-word-only query ("how do
 * I") makes an empty tsquery that matches no message at all.
 */
export async function searchSessions(
  q: string,
  filters: HistoryFilters = {},
  now = new Date(),
  client: Executor = db
): Promise<SessionSearchResult[]> {
  const needle = q.trim()
  if (!needle) return []
  const limit = Math.min(Math.max(filters.limit ?? 60, 1), 200)
  const like = `%${needle.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const from = filters.from?.toISOString() ?? null
  const to = filters.to?.toISOString() ?? null
  const slug = filters.clientSlug ?? null
  const surface = filters.surface ?? null

  const hitRows = (await client.execute(sql`
    with q as (select websearch_to_tsquery('english', ${needle}) as tsq)
    select sm.session_ref, sm.role, sm.at,
           ts_rank(sm.tsv, q.tsq) as rank,
           ts_headline('english', sm.text, q.tsq, ${HEADLINE_OPTS}) as snippet
    from session_messages sm
    cross join q
    left join session_notes n on n.session_ref = sm.session_ref
    left join agent_sessions a on a.session_ref = sm.session_ref
    left join clients c on c.id = coalesce(n.client_id, a.client_id)
    where numnode(q.tsq) > 0
      and sm.tsv @@ q.tsq
      and (${slug}::text is null or c.slug = ${slug}::text)
      and (${surface}::text is null or sm.surface = ${surface}::text)
      and (${from}::timestamptz is null or sm.at >= ${from}::timestamptz)
      and (${to}::timestamptz is null or sm.at < ${to}::timestamptz)
    order by rank desc, sm.at desc
    limit 400
  `)) as unknown as Row[]

  const titleRows = (await client.execute(sql`
    select * from (${SELECT_SESSIONS}) s
    where (s.title ilike ${like} or s.summary ilike ${like})
      and (${slug}::text is null or s.client_slug = ${slug}::text)
      and (${surface}::text is null or s.surface = ${surface}::text)
      and (${from}::timestamptz is null or s.at >= ${from}::timestamptz)
      and (${to}::timestamptz is null or s.at < ${to}::timestamptz)
    order by s.at desc
    limit ${limit}
  `)) as unknown as Row[]

  const byRef = new Map<string, { rank: number; hits: SessionSearchHit[] }>()
  for (const hit of hitRows) {
    const ref = str(hit.session_ref)
    const entry = byRef.get(ref) ?? { rank: 0, hits: [] }
    entry.rank = Math.max(entry.rank, Number(hit.rank ?? 0))
    if (entry.hits.length < 4) {
      entry.hits.push({
        role: str(hit.role),
        at: iso(hit.at) ?? "",
        snippet: parseSnippet(str(hit.snippet)),
      })
    }
    byRef.set(ref, entry)
  }

  await ensureClientColors().catch(() => ({}))
  const known = new Map<string, SessionHistoryRow>()
  for (const r of titleRows) known.set(str(r.session_ref), toRow(r, now))

  const refs = Array.from(
    new Set([...Array.from(byRef.keys()), ...Array.from(known.keys())])
  ).slice(0, limit)
  if (!refs.length) return []

  const missing = refs.filter((ref) => !known.has(ref))
  if (missing.length) {
    const rows = (await client.execute(sql`
      select * from (${SELECT_SESSIONS}) s
      where s.session_ref in (select jsonb_array_elements_text(${JSON.stringify(missing)}::jsonb))
    `)) as unknown as Row[]
    for (const r of rows) known.set(str(r.session_ref), toRow(r, now))
  }

  const ranked = refs
    .map((ref) => {
      const row = known.get(ref)
      if (!row) return null
      const found = byRef.get(ref)
      return { ...row, hits: found?.hits ?? [], matchedTitle: !found, rank: found?.rank ?? 0 }
    })
    .filter((r): r is SessionSearchResult & { rank: number } => r !== null)
    .sort((a, b) => (b.rank === a.rank ? (a.at < b.at ? 1 : -1) : b.rank - a.rank))

  return ranked.map(({ rank: _rank, ...rest }) => rest)
}

export type SessionMessageView = { role: string; at: string; text: string; origin: string }

/**
 * The conversation as the peek shows it: how it opened and how it ended. The
 * middle is deliberately not fetched — that is what search is for.
 */
export async function messagesForSession(
  sessionRef: string,
  opts: { head?: number; tail?: number } = {},
  client: Executor = db
): Promise<{ total: number; head: SessionMessageView[]; tail: SessionMessageView[] }> {
  const head = Math.max(0, opts.head ?? 2)
  const tail = Math.max(0, opts.tail ?? 4)
  const rows = (await client.execute(sql`
    (select role, at, text, origin from session_messages
      where session_ref = ${sessionRef} order by at asc limit ${head + tail + 1})
    union all
    (select role, at, text, origin from session_messages
      where session_ref = ${sessionRef} order by at desc limit ${tail})
  `)) as unknown as Row[]
  const counted = (await client.execute(sql`
    select count(*)::int as n from session_messages where session_ref = ${sessionRef}
  `)) as unknown as Row[]
  const total = Number(counted[0]?.n ?? 0)

  const seen = new Set<string>()
  const all: SessionMessageView[] = []
  for (const r of rows) {
    const view = { role: str(r.role), at: iso(r.at) ?? "", text: str(r.text), origin: str(r.origin) }
    const key = `${view.role}|${view.at}`
    if (seen.has(key)) continue
    seen.add(key)
    all.push(view)
  }
  all.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  if (all.length <= head + tail) return { total, head: all, tail: [] }
  return { total, head: all.slice(0, head), tail: all.slice(all.length - tail) }
}

/** How far back the history page looks by default; older days are a date filter away. */
export const HISTORY_DEFAULT_DAYS = 7

/** The board's own window, re-exported so the page can say where "live" ends. */
export const BOARD_WINDOW_DAYS = LEFTOFF_RULES.boardWindowDays
