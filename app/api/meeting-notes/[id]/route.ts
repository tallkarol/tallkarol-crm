import { NextResponse } from "next/server"
import { loadNote } from "@/lib/meeting-notes"
import { authenticateTimeRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/** One note, for the worker's salvage pass after a restart. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const note = await loadNote(params.id)
  if (!note) return NextResponse.json({ error: "That note does not exist." }, { status: 404 })
  const { segments, itemRows, ...rest } = note
  return NextResponse.json(
    { note: { ...rest, segmentCount: segments.length, itemCount: itemRows.length } },
    { headers: { "cache-control": "no-store" } }
  )
}
