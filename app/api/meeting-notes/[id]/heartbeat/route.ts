import { NextResponse } from "next/server"
import { recordHeartbeat } from "@/lib/meeting-notes"
import { authenticateTimeRequest, badRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Every five seconds while recording: { worker, levels: { mic, sys } }.
 * Answers { verdict: "continue" | "stop" | "discard" } — Stop travels back
 * on this channel, never as a queue item, because only the process holding
 * the helper can stop it.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  const worker = readString(body, "worker")
  if (!worker) return badRequest("Send `worker`.")
  const result = await recordHeartbeat({ noteId: params.id, worker, levels: body.levels })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data, { headers: { "cache-control": "no-store" } })
}
