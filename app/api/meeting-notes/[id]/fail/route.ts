import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { failStage } from "@/lib/meeting-notes"
import { authenticateTimeRequest, badRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/** POST { worker, stage: "capture" | "transcript", error } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  const worker = readString(body, "worker")
  const stage = readString(body, "stage")
  if (!worker) return badRequest("Send `worker`.")
  if (stage !== "capture" && stage !== "transcript") return badRequest("`stage` must be capture or transcript.")
  const result = await failStage({ noteId: params.id, worker, stage, error: readString(body, "error") ?? "" })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  revalidatePath(ROUTES.meetingNotes)
  revalidatePath(ROUTES.meetingNote(params.id))
  revalidatePath(ROUTES.timesheetLive)
  return NextResponse.json(result.data)
}
