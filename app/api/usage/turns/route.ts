import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { agentTurns, clients } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { authenticateTimeRequest, badRequest, readJson, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Metered turns from the Mac (`push-turns.py` in daedalus-hive-mind): one
 * row per agent_meter row — a Claude Code or Cursor turn, or a subagent run
 * — with the usage the transcript carried. Keyed by `meterRef`
 * ("<host>:<agent_meter.id>"), so a re-push is a merge, not a duplicate.
 *
 * POST { host, turns: [{ meterRef, sessionRef, surface, kind, agentId?,
 *        clientSlug?, cwd?, startedAt, endedAt, seconds, model?, effort?,
 *        lane?, requests?, inputTokens?, cacheWriteTokens?,
 *        cacheReadTokens?, outputTokens?, thinkingTokens?, origin? }] }
 *   up to 500 per call. 200 { accepted: [meterRef], unknownClients: [slug] }
 *
 * Every value column merges with coalesce(excluded, existing): a later push
 * fills blanks and a recompute may lower a number, but a NULL — "unknown" —
 * never erases a value. An unknown client slug keeps the slug and leaves
 * client_id NULL rather than rejecting the row: the caps are account-wide
 * and the 5-hour pace needs every token, attributed or not.
 */

type Turn = Record<string, unknown>

const MAX = 500

function str(v: unknown, max = 500): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null
}

/** A token count: unknown stays null; a negative is a bug upstream and lands as 0. */
function big(v: unknown): number | null {
  const n = num(v)
  return n === null ? null : Math.max(0, n)
}

function instant(v: unknown): Date | null {
  if (typeof v !== "string" && typeof v !== "number") return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const list = Array.isArray(body.turns) ? (body.turns as Turn[]) : []
  if (!list.length) return badRequest("Send `turns`: a non-empty array.")
  if (list.length > MAX) return badRequest(`At most ${MAX} turns per call.`)

  const slugs = Array.from(
    new Set(list.map((t) => str(t.clientSlug, 120)).filter((s): s is string => !!s))
  )
  const known = slugs.length
    ? await db.select({ id: clients.id, slug: clients.slug }).from(clients).where(sql`${clients.slug} in ${slugs}`)
    : []
  const idBySlug = new Map(known.map((c) => [c.slug, c.id]))
  const unknownClients = slugs.filter((s) => !idBySlug.has(s))

  const rows = []
  const accepted: string[] = []
  const errors: string[] = []
  for (const t of list) {
    const meterRef = str(t.meterRef, 120)
    const sessionRef = str(t.sessionRef, 200)
    const startedAt = instant(t.startedAt)
    const endedAt = instant(t.endedAt)
    if (!meterRef || !sessionRef || !startedAt || !endedAt) {
      errors.push(meterRef ?? "(no meterRef)")
      continue
    }
    const surface = str(t.surface, 20) === "cursor" ? "cursor" : "claude"
    const kind = str(t.kind, 20) === "subagent" ? "subagent" : "turn"
    const clientSlug = str(t.clientSlug, 120)
    rows.push({
      meterRef,
      sessionRef,
      surface,
      kind,
      agentId: str(t.agentId, 120),
      clientId: clientSlug ? (idBySlug.get(clientSlug) ?? null) : null,
      clientSlug,
      cwd: str(t.cwd, 500) ?? "",
      startedAt,
      endedAt,
      seconds: Math.max(0, num(t.seconds) ?? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)),
      model: str(t.model, 120),
      effort: str(t.effort, 40),
      lane: str(t.lane, 160),
      requests: num(t.requests),
      inputTokens: big(t.inputTokens),
      cacheWriteTokens: big(t.cacheWriteTokens),
      cacheReadTokens: big(t.cacheReadTokens),
      outputTokens: big(t.outputTokens),
      thinkingTokens: big(t.thinkingTokens),
      origin: str(t.origin, 20) ?? "hook",
      deviceId: caller.deviceId,
      pushedAt: new Date(),
    })
    accepted.push(meterRef)
  }

  if (rows.length) {
    const keep = (col: string) => sql.raw(`coalesce(excluded.${col}, agent_turns.${col})`)
    await db
      .insert(agentTurns)
      .values(rows)
      .onConflictDoUpdate({
        target: agentTurns.meterRef,
        set: {
          sessionRef: sql`excluded.session_ref`,
          surface: sql`excluded.surface`,
          kind: sql`excluded.kind`,
          agentId: keep("agent_id"),
          clientId: keep("client_id"),
          clientSlug: keep("client_slug"),
          cwd: sql`case when excluded.cwd = '' then agent_turns.cwd else excluded.cwd end`,
          startedAt: sql`excluded.started_at`,
          endedAt: sql`excluded.ended_at`,
          seconds: sql`excluded.seconds`,
          model: keep("model"),
          effort: keep("effort"),
          lane: keep("lane"),
          requests: keep("requests"),
          inputTokens: keep("input_tokens"),
          cacheWriteTokens: keep("cache_write_tokens"),
          cacheReadTokens: keep("cache_read_tokens"),
          outputTokens: keep("output_tokens"),
          thinkingTokens: keep("thinking_tokens"),
          origin: sql`excluded.origin`,
          deviceId: keep("device_id"),
          pushedAt: sql`excluded.pushed_at`,
        },
      })
    revalidatePath(ROUTES.usage)
  }

  return NextResponse.json({ accepted, rejected: errors, unknownClients })
}

/** GET ?session=<ref> — the turns of one conversation, oldest first. */
export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const sessionRef = new URL(request.url).searchParams.get("session")
  if (!sessionRef) return badRequest("Pass ?session=<ref>.")
  const rows = await db
    .select()
    .from(agentTurns)
    .where(eq(agentTurns.sessionRef, sessionRef))
    .orderBy(agentTurns.startedAt)
  return NextResponse.json({ turns: rows })
}
