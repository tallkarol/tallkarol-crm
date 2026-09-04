import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { agentSessions, clients, projects, timeEntrySessions } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import {
  authenticateTimeRequest,
  badRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Session summaries from `session-log` (daedalus-hive-mind): what a
 * conversation did, keyed by the session id the meter hooks already record.
 * Upsert on `sessionRef`; a non-empty summary is never overwritten by an
 * empty one. Only the model-written summary lands here — the prompts and
 * replies themselves are `session_messages`, written by the board's hooks.
 *
 * POST { sessionRef, surface?, name?, clientSlug? | clientId?, projectSlug?,
 *        cwd?, repos?, filesTouched?, startedAt?, endedAt?, summary?,
 *        highlights?, tokensIn?, tokensOut?, meterHours?, model? }
 *   or { sessions: [ ...same objects ] } for a batch push.
 * 200 { sessions: [{ sessionRef, url }] }
 *
 * GET ?client=<slug>&since=<ISO>&unlinked=1&unattributed=1&limit=<n>
 *   sessions, newest first. `unattributed=1` returns only the ones with no
 *   client — what the attribution pass reads, since a session nobody can
 *   name is invisible to the ledger no matter how much of it we stored.
 */

type SessionBody = Record<string, unknown>

function cleanList(value: unknown, max = 60): string[] {
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string" && !!v.trim())
        .map((v) => v.trim().slice(0, 500))
        .slice(0, max)
    : []
}

function instant(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

async function upsertOne(body: SessionBody): Promise<{ sessionRef: string } | { error: string }> {
  const sessionRef = readString(body, "sessionRef")
  if (!sessionRef || sessionRef.length > 200) return { error: "`sessionRef` is required." }

  let clientId = readString(body, "clientId")
  let projectId = readString(body, "projectId")
  const clientSlug = readString(body, "clientSlug")
  const projectSlug = readString(body, "projectSlug")
  if (!clientId && clientSlug) {
    const client = await db.query.clients.findFirst({ where: eq(clients.slug, clientSlug) })
    if (!client) return { error: `No client with slug "${clientSlug}".` }
    clientId = client.id
  }
  if (!projectId && projectSlug) {
    const project = await db.query.projects.findFirst({ where: eq(projects.slug, projectSlug) })
    if (!project) return { error: `No project with slug "${projectSlug}".` }
    projectId = project.id
    clientId = clientId ?? project.clientId
  }

  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 4000) : ""
  const highlights = cleanList(body.highlights, 20)
  const now = new Date()
  const values = {
    sessionRef,
    surface: readString(body, "surface") ?? "claude",
    name: (readString(body, "name") ?? "").slice(0, 300),
    clientId,
    projectId,
    cwd: (readString(body, "cwd") ?? "").slice(0, 500),
    repos: cleanList(body.repos, 20),
    filesTouched: cleanList(body.filesTouched, 200),
    startedAt: instant(body.startedAt),
    endedAt: instant(body.endedAt),
    summary,
    highlights,
    tokensIn: typeof body.tokensIn === "number" ? Math.max(0, Math.floor(body.tokensIn)) : 0,
    tokensOut: typeof body.tokensOut === "number" ? Math.max(0, Math.floor(body.tokensOut)) : 0,
    meterHours:
      typeof body.meterHours === "number" ? (Math.round(body.meterHours * 100) / 100).toFixed(2) : "0",
    model: (readString(body, "model") ?? "").slice(0, 80),
    summarizedAt: summary ? now : null,
    updatedAt: now,
  }

  await db
    .insert(agentSessions)
    .values(values)
    .onConflictDoUpdate({
      target: agentSessions.sessionRef,
      set: {
        surface: values.surface,
        name: sql`case when excluded.name = '' then ${agentSessions.name} else excluded.name end`,
        clientId: sql`coalesce(excluded.client_id, ${agentSessions.clientId})`,
        projectId: sql`coalesce(excluded.project_id, ${agentSessions.projectId})`,
        cwd: sql`case when excluded.cwd = '' then ${agentSessions.cwd} else excluded.cwd end`,
        repos: values.repos.length ? values.repos : sql`${agentSessions.repos}`,
        filesTouched: values.filesTouched.length ? values.filesTouched : sql`${agentSessions.filesTouched}`,
        startedAt: sql`coalesce(excluded.started_at, ${agentSessions.startedAt})`,
        endedAt: sql`coalesce(excluded.ended_at, ${agentSessions.endedAt})`,
        summary: sql`case when excluded.summary = '' then ${agentSessions.summary} else excluded.summary end`,
        highlights: highlights.length ? highlights : sql`${agentSessions.highlights}`,
        tokensIn: sql`greatest(excluded.tokens_in, ${agentSessions.tokensIn})`,
        tokensOut: sql`greatest(excluded.tokens_out, ${agentSessions.tokensOut})`,
        meterHours: sql`greatest(excluded.meter_hours, ${agentSessions.meterHours})`,
        model: sql`case when excluded.model = '' then ${agentSessions.model} else excluded.model end`,
        summarizedAt: sql`coalesce(excluded.summarized_at, ${agentSessions.summarizedAt})`,
        updatedAt: now,
      },
    })
  return { sessionRef }
}

export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const batch = Array.isArray(body.sessions) ? (body.sessions as SessionBody[]) : [body]
  if (batch.length > 200) return badRequest("At most 200 sessions per push.")

  const results: { sessionRef: string; url: string }[] = []
  for (const one of batch) {
    if (!one || typeof one !== "object") return badRequest("Each session must be an object.")
    const result = await upsertOne(one)
    if ("error" in result) return badRequest(result.error)
    results.push({ sessionRef: result.sessionRef, url: `${ROUTES.timesheetReview}?peek=session:${encodeURIComponent(result.sessionRef)}` })
  }

  revalidatePath(ROUTES.timesheetReview)
  revalidatePath(ROUTES.timesheetEntries)
  return NextResponse.json({ sessions: results })
}

export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const url = new URL(request.url)
  const clientSlug = url.searchParams.get("client")?.trim() || null
  const since = instant(url.searchParams.get("since"))
  const unlinked = url.searchParams.get("unlinked") === "1"
  const unattributed = url.searchParams.get("unattributed") === "1"
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200))

  let clientId: string | null = null
  if (clientSlug) {
    const client = await db.query.clients.findFirst({ where: eq(clients.slug, clientSlug) })
    if (!client) return badRequest(`No client with slug "${clientSlug}".`)
    clientId = client.id
  }

  const rows = await db.query.agentSessions.findMany({
    where: and(
      clientId ? eq(agentSessions.clientId, clientId) : undefined,
      unattributed ? isNull(agentSessions.clientId) : undefined,
      since ? gte(agentSessions.startedAt, since) : undefined
    ),
    with: {
      client: { columns: { slug: true } },
      project: { columns: { slug: true } },
      entries: { columns: { timeEntryId: true, shareHours: true } },
    },
    orderBy: [desc(agentSessions.startedAt)],
    limit,
  })

  // How much of the conversation itself survives, so the ledger side can tell
  // a session with evidence from one that rests on the summary alone.
  const refs = rows.map((row) => row.sessionRef)
  const counts = new Map<string, number>()
  if (refs.length) {
    const counted = (await db.execute(sql`
      select session_ref, count(*)::int as n from session_messages
      where session_ref in (select jsonb_array_elements_text(${JSON.stringify(refs)}::jsonb))
      group by session_ref
    `)) as unknown as { session_ref: string; n: number }[]
    for (const row of counted) counts.set(row.session_ref, Number(row.n))
  }

  const sessions = rows
    .filter((row) => !unlinked || row.entries.length === 0)
    .map((row) => ({
      messageCount: counts.get(row.sessionRef) ?? 0,
      sessionRef: row.sessionRef,
      surface: row.surface,
      name: row.name,
      cwd: row.cwd,
      client: row.client?.slug ?? null,
      project: row.project?.slug ?? null,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      summary: row.summary,
      highlights: row.highlights,
      meterHours: Number(row.meterHours),
      entries: row.entries.map((e) => ({ timeEntryId: e.timeEntryId, hours: Number(e.shareHours) })),
      summarizedAt: row.summarizedAt,
    }))

  return NextResponse.json({ sessions }, { headers: { "cache-control": "no-store" } })
}

// Imported for the relation type only.
void timeEntrySessions
