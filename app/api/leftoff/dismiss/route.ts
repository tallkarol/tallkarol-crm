import { NextResponse } from "next/server"
import { authenticateLeftOff, unauthorized } from "@/lib/leftoff-auth"
import { dismissNote } from "@/lib/leftoff-data"

export const dynamic = "force-dynamic"

/** POST { sessionRef } — hide a note. A new prompt on that chat brings it back. */
export async function POST(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    /* fall through to the required-field error */
  }
  const sessionRef = typeof body.sessionRef === "string" ? body.sessionRef.trim() : ""
  if (!sessionRef) return NextResponse.json({ error: "`sessionRef` is required." }, { status: 400 })
  const found = await dismissNote(sessionRef)
  if (!found) return NextResponse.json({ error: "No such note." }, { status: 404 })
  return NextResponse.json({ ok: true, sessionRef })
}
