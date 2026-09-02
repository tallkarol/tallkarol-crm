import { NextResponse } from "next/server"
import { authenticateLeftOff, unauthorized } from "@/lib/leftoff-auth"
import { convertNote } from "@/lib/leftoff-data"
import { authenticateTimeRequest } from "@/lib/time-api"
import { widgetUserId } from "@/lib/widget-auth"

export const dynamic = "force-dynamic"

/** POST { sessionRef, to: "task" | "ticket" } → { ok, taskId | ticketId, url } */
export async function POST(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    /* required-field error below */
  }
  const sessionRef = typeof body.sessionRef === "string" ? body.sessionRef.trim() : ""
  const to = body.to === "ticket" ? "ticket" : body.to === "task" ? "task" : null
  if (!sessionRef || !to) {
    return NextResponse.json({ error: "Send `sessionRef` and `to` (task | ticket)." }, { status: 400 })
  }
  const caller = await authenticateTimeRequest(request)
  const userId = caller?.userId ?? (await widgetUserId())
  const result = await convertNote(sessionRef, to, userId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
