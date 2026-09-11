import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { MAX_TRANSCRIPT_BYTES } from "@/lib/meeting-note"
import { saveTranscript } from "@/lib/meeting-notes"
import { authenticateTimeRequest, badRequest, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"
/** The analysis runs inside this request; Vercel-style limits do not apply on Railway, but say so. */
export const maxDuration = 300

/**
 * The transcript, segment-level: { worker, segments: [{ start, end, speaker, text }], model, language }.
 * The text twin is derived here and the notes are written before this returns —
 * the worker gives this call three minutes.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const raw = await request.text()
  if (raw.length > MAX_TRANSCRIPT_BYTES) return badRequest("That transcript is too large — send segment-level timestamps, not words.", 413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return badRequest("Body must be JSON.")
  }
  const worker = readString(body, "worker")
  if (!worker) return badRequest("Send `worker`.")
  const result = await saveTranscript({
    noteId: params.id,
    worker,
    segments: body.segments,
    model: readString(body, "model"),
    language: readString(body, "language"),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  revalidatePath(ROUTES.meetingNotes)
  revalidatePath(ROUTES.meetingNote(params.id))
  const note = result.data
  return NextResponse.json({
    id: note.id,
    status: note.status,
    analysisStatus: note.analysisStatus,
    analysisError: note.analysisError,
    title: note.title,
    proposals: note.items.proposed,
    url: ROUTES.meetingNote(note.id),
  })
}
