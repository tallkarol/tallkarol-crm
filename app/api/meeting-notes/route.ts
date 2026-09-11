import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { createImport, listNotes } from "@/lib/meeting-notes"
import { authenticateTimeRequest, badRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * A meeting the Mac found on disk — `npm run meeting:import <file>`. Audio
 * lands `recorded` with transcription queued for that worker; a caption or
 * text file arrives with `segments` and skips Whisper.
 *
 * POST { worker, title?, clientSlug? | clientId?, projectSlug? | projectId?,
 *        startedAt?, durationSec?, recordingPath?, tracks?, segments?,
 *        language?, model?, clientRequestId? }
 * 201 { id, url } — 200 with `replayed: true` on the same clientRequestId.
 *
 * GET — the caller's notes, newest first.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  const worker = readString(body, "worker")
  if (!worker) return badRequest("Send `worker` — the Mac's name.")

  const result = await createImport({
    userId: caller.userId,
    worker,
    title: readString(body, "title"),
    clientSlug: readString(body, "clientSlug"),
    clientId: readString(body, "clientId"),
    projectSlug: readString(body, "projectSlug"),
    projectId: readString(body, "projectId"),
    startedAt: readString(body, "startedAt"),
    durationSec: typeof body.durationSec === "number" ? body.durationSec : null,
    recordingPath: readString(body, "recordingPath"),
    tracks: Array.isArray(body.tracks) ? (body.tracks as string[]) : null,
    segments: body.segments,
    language: readString(body, "language"),
    model: readString(body, "model"),
    clientRequestId: readString(body, "clientRequestId"),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  revalidatePath(ROUTES.meetingNotes)
  return NextResponse.json(
    { id: result.data.id, url: ROUTES.meetingNote(result.data.id), replayed: result.data.replayed },
    { status: result.data.replayed ? 200 : 201 }
  )
}

export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const notes = await listNotes(caller.userId)
  return NextResponse.json({ notes }, { headers: { "cache-control": "no-store" } })
}
