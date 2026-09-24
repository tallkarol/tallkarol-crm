import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { decideToolCall } from "@/lib/chat/turns"
import {
  authenticateTimeRequest,
  readJson,
  unauthorized,
} from "@/lib/time-api"
import { approveFromBody } from "@/lib/waiting"

export const dynamic = "force-dynamic"

/**
 * Confirm or reject a parked write.
 *
 * This is the only path by which anything the chat proposes reaches a table.
 * The tool runs here, in the CRM, under Karol's user — never on the worker,
 * which holds no database credentials.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  // Written beside the verbs that produce it, in lib/waiting.ts, and tested by
  // `npm run check:waiting`. The queue sends `approve` as a string, and a bare
  // truthiness check would read `"false"` as a Confirm.
  const approve = approveFromBody(body.approve)

  const outcome = await decideToolCall({
    userId: caller.userId,
    callId: params.id,
    approve,
  })

  revalidatePath("/chat")
  revalidatePath("/timesheet")
  revalidatePath("/tasks")
  // The dashboard carries the same parked write as a queue row now, so a
  // decision made from a device has to clear it there too. `decideApproval`
  // in lib/chat/actions.ts has always revalidated `/`; this path had not.
  revalidatePath("/")

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 400 })
  }

  return NextResponse.json({
    status: outcome.call.status,
    result: outcome.result,
  })
}
