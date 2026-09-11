import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { claimCapture, claimTranscription } from "@/lib/meeting-notes"
import { authenticateTimeRequest, badRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The meeting worker's poll. One unit of work per call, capture before
 * transcription — a Start is time-critical, a transcript can wait.
 *
 * POST { worker } → { capture } | { transcribe } | { none: true }
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  const worker = readString(body, "worker")
  if (!worker) return badRequest("Send `worker` — a stable name, the Mac's hostname.")

  const capture = await claimCapture(worker)
  if (capture) {
    revalidatePath(ROUTES.timesheetLive)
    return NextResponse.json({ capture }, { headers: { "cache-control": "no-store" } })
  }
  const transcribe = await claimTranscription(worker)
  if (transcribe) return NextResponse.json({ transcribe }, { headers: { "cache-control": "no-store" } })
  return NextResponse.json({ none: true }, { headers: { "cache-control": "no-store" } })
}
