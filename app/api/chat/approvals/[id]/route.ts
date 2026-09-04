import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { decideToolCall } from "@/lib/chat/turns"
import {
  authenticateTimeRequest,
  readJson,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Confirm or reject a parked write.
 *
 * This is the only path by which anything the chat proposes reaches a table.
 * The tool runs here, in the CRM, under Karol's user — never on the worker,
 * which holds no database credentials.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const approve = body.approve !== false

  const outcome = await decideToolCall({
    userId: caller.userId,
    callId: params.id,
    approve,
  })

  revalidatePath("/chat")
  revalidatePath("/timesheet")
  revalidatePath("/tasks")

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 400 })
  }

  return NextResponse.json({
    status: outcome.call.status,
    result: outcome.result,
  })
}
