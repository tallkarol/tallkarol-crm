import { NextResponse } from "next/server"
import { attachmentFile, imageResponse } from "@/lib/chat/attachment-data"
import { authenticateTimeRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The worker's copy of a screenshot. The claim names the images a turn
 * carries; the bytes come from here, one request each, so a thread with six
 * screenshots does not turn the claim into a 30 MB JSON body. Only images
 * already sent with a message — an unsent paste is nobody's business yet.
 *
 * Same trust as /api/chat/queue, which hands any thread to any admin
 * device: the token is not required to belong to whoever pasted, because
 * the worker's token is issued once per Mac, not per person.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const row = await attachmentFile(params.id)
  if (!row || !row.messageId) {
    return new NextResponse("Not found", { status: 404 })
  }
  return imageResponse(row)
}
