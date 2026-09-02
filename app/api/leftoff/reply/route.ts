import { NextResponse } from "next/server"
import { authenticateLeftOff, unauthorized } from "@/lib/leftoff-auth"
import { queueReply, readReply } from "@/lib/leftoff-data"

export const dynamic = "force-dynamic"

/**
 * Reply to a chat from the board.
 *
 *   POST { sessionRef, text }   — queue it (empty text clears the queue)
 *   GET  ?sessionRef=…&take=1   — the chat's own hook reads it at its next
 *                                 turn; `take` clears it in the same statement.
 */
export async function POST(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    /* required-field error below */
  }
  const sessionRef = typeof body.sessionRef === "string" ? body.sessionRef.trim() : ""
  const text = typeof body.text === "string" ? body.text : ""
  if (!sessionRef) return NextResponse.json({ error: "`sessionRef` is required." }, { status: 400 })
  const found = await queueReply(sessionRef, text)
  if (!found) return NextResponse.json({ error: "No such note." }, { status: 404 })
  return NextResponse.json({ ok: true, sessionRef, delivery: text.trim() ? "queued" : "cleared" })
}

export async function GET(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()
  const url = new URL(request.url)
  const sessionRef = (url.searchParams.get("sessionRef") ?? "").trim()
  if (!sessionRef) return NextResponse.json({ error: "`sessionRef` is required." }, { status: 400 })
  const take = url.searchParams.get("take") === "1"
  const reply = await readReply(sessionRef, take)
  return NextResponse.json({ sessionRef, reply, taken: take && !!reply }, { headers: { "cache-control": "no-store" } })
}
