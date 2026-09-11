import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { markRecorded } from "@/lib/meeting-notes"
import { authenticateTimeRequest, badRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The helper stopped and the files are whole.
 * POST { worker, durationSec, tracks: ["mic","system"], recordingPath }
 * 200 { replayed } — the row is `recorded`, transcription queued for this worker.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  const worker = readString(body, "worker")
  if (!worker) return badRequest("Send `worker`.")
  const result = await markRecorded({
    noteId: params.id,
    worker,
    durationSec: typeof body.durationSec === "number" ? body.durationSec : 0,
    tracks: Array.isArray(body.tracks) ? (body.tracks as string[]) : [],
    recordingPath: readString(body, "recordingPath") ?? "",
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  revalidatePath(ROUTES.meetingNotes)
  revalidatePath(ROUTES.meetingNote(params.id))
  revalidatePath(ROUTES.timesheetLive)
  return NextResponse.json(result.data)
}
