import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { isMessageRole, isSurface, clipHead, clipTail, LEFTOFF_RULES } from "@/lib/leftoff"
import { authenticateTimeRequest, badRequest, readJson, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The one-time transcript backfill — history from before the hooks existed.
 *
 *   POST /api/leftoff/messages
 *   Authorization: Bearer <device token>
 *   { messages: [{ sessionRef, surface?, role, at, text }] }   // up to 100
 *
 * Device token only: the menu bar reads history, it never writes it.
 *
 * A session the hooks have ever written is refused outright, in the same
 * statement that inserts — the hook rows are the truthful ones, and transcript
 * timestamps land milliseconds away from hook timestamps, which would quietly
 * double every turn near the boundary. Everything else is idempotent through
 * (session_ref, role, at), so a rerun writes nothing twice.
 */

const MAX_BATCH = 100

type Incoming = { sessionRef: string; surface: string; role: string; at: Date; text: string }

function parse(raw: unknown): Incoming | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Each message must be an object." }
  const body = raw as Record<string, unknown>
  const sessionRef = typeof body.sessionRef === "string" ? body.sessionRef.trim() : ""
  if (!sessionRef || sessionRef.length > 200) return { error: "`sessionRef` is required." }
  if (!isMessageRole(body.role)) return { error: "`role` must be user or assistant." }
  const at = typeof body.at === "string" || typeof body.at === "number" ? new Date(body.at) : null
  if (!at || Number.isNaN(at.getTime())) return { error: "`at` must be a timestamp." }
  const raw_text = typeof body.text === "string" ? body.text : ""
  const text =
    body.role === "user"
      ? clipHead(raw_text, LEFTOFF_RULES.maxMessagePrompt)
      : clipTail(raw_text, LEFTOFF_RULES.maxMessageReply)
  if (!text) return { error: "`text` is empty." }
  const surface = isSurface(body.surface) ? body.surface : sessionRef.startsWith("cursor:") ? "cursor" : "claude"
  return { sessionRef, surface, role: body.role, at, text }
}

export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const list = Array.isArray(body.messages) ? body.messages : [body]
  if (!list.length) return badRequest("No messages.")
  if (list.length > MAX_BATCH) return badRequest(`At most ${MAX_BATCH} messages per push.`)

  const parsed: Incoming[] = []
  const errors: string[] = []
  for (const raw of list) {
    const one = parse(raw)
    if ("error" in one) errors.push(one.error)
    else parsed.push(one)
  }
  if (!parsed.length) return badRequest(errors[0] ?? "Nothing to write.")

  // Which of these sessions the hooks already own — those are left alone.
  const refs = Array.from(new Set(parsed.map((m) => m.sessionRef)))
  const owned = (await db.execute(sql`
    select distinct session_ref from session_messages
    where origin = 'hook'
      and session_ref in (select jsonb_array_elements_text(${JSON.stringify(refs)}::jsonb))
  `)) as unknown as { session_ref: string }[]
  const hookOwned = new Set(owned.map((r) => r.session_ref))

  const writable = parsed.filter((m) => !hookOwned.has(m.sessionRef))
  let inserted = 0
  if (writable.length) {
    const rows = (await db.execute(sql`
      insert into session_messages (session_ref, surface, role, at, text, origin)
      select t.session_ref, t.surface, t.role, t.at, t.text, 'backfill'
      from jsonb_to_recordset(${JSON.stringify(
        writable.map((m) => ({
          session_ref: m.sessionRef,
          surface: m.surface,
          role: m.role,
          at: m.at.toISOString(),
          text: m.text,
        }))
      )}::jsonb)
        as t(session_ref text, surface text, role text, at timestamptz, text text)
      on conflict (session_ref, role, at) do nothing
      returning id
    `)) as unknown as { id: string }[]
    inserted = rows.length
  }

  return NextResponse.json({
    inserted,
    skipped: parsed.length - inserted,
    hookOwned: Array.from(hookOwned),
    ...(errors.length ? { errors } : {}),
  })
}
