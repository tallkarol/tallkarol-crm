import { NextResponse } from "next/server"
import { isLeftOffEvent, isSurface, type LeftOffEvent, type Surface } from "@/lib/leftoff"
import { authenticateLeftOff, unauthorized } from "@/lib/leftoff-auth"
import { loadLeftOff, recordNote, type IncomingNote } from "@/lib/leftoff-data"

export const dynamic = "force-dynamic"

/**
 * Where I left off — the write side.
 *
 *   POST /api/leftoff
 *   Authorization: Bearer <device or widget token>
 *   { sessionRef, surface, event, at, cwd?, branch?, title?, prompt?, reply?,
 *     body?, pinned?, meta? }            — or { notes: [ …up to 50 ] }
 *
 * `event` is the hook's own name (UserPromptSubmit, Stop, Notification,
 * SessionEnd, SubagentStop; Cursor's beforeSubmitPrompt, afterAgentResponse,
 * stop, sessionEnd), or `gone` (a dead process), `note` (a post-it — no
 * sessionRef makes a fresh one), `snapshot` (the browser row), `touch`.
 * `at` orders events: an older one never overwrites a newer row.
 *
 *   GET /api/leftoff — the same payload the widget reads, for the CLI.
 */

const MAX_BATCH = 50
const MAX_META_BYTES = 64 * 1024

function instant(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function str(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function parseNote(raw: unknown, now: Date): IncomingNote | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Each note must be an object." }
  const body = raw as Record<string, unknown>
  const event = body.event
  if (!isLeftOffEvent(event)) return { error: `Unknown event "${String(event)}".` }
  const surface: Surface = isSurface(body.surface) ? body.surface : "claude"
  const sessionRef = str(body.sessionRef)?.trim() || null
  if (sessionRef && sessionRef.length > 200) return { error: "`sessionRef` is too long." }
  if (!sessionRef && event !== "note" && event !== "snapshot") {
    return { error: "`sessionRef` is required." }
  }
  let meta: Record<string, unknown> | undefined
  if (body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)) {
    meta = body.meta as Record<string, unknown>
    if (JSON.stringify(meta).length > MAX_META_BYTES) return { error: "`meta` is too large." }
  }
  return {
    sessionRef,
    surface,
    event: event as LeftOffEvent,
    at: instant(body.at) ?? now,
    cwd: str(body.cwd),
    branch: str(body.branch),
    title: str(body.title),
    prompt: str(body.prompt),
    reply: str(body.reply),
    body: str(body.body),
    pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
    meta,
  }
}

export async function POST(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 })
  }

  const now = new Date()
  const list = Array.isArray(payload.notes) ? payload.notes.slice(0, MAX_BATCH) : [payload]
  if (!list.length) return NextResponse.json({ error: "No notes" }, { status: 400 })

  const results = []
  const errors: string[] = []
  for (const raw of list) {
    const parsed = parseNote(raw, now)
    if ("error" in parsed) {
      errors.push(parsed.error)
      continue
    }
    try {
      results.push(await recordNote(parsed))
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "write failed")
    }
  }

  if (!results.length && errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 })
  }
  const written = results.filter((r) => r.applied).length
  const single = list.length === 1 && results.length === 1 ? results[0] : null
  return NextResponse.json({
    ok: true,
    written,
    skipped: results.length - written,
    ...(single ? { sessionRef: single.sessionRef, state: single.state } : {}),
    results,
    ...(errors.length ? { errors } : {}),
  })
}

export async function GET(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()
  const payload = await loadLeftOff(new Date())
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } })
}
