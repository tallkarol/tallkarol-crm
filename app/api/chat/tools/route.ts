import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { invokeTool } from "@/lib/chat/turns"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * A tool the model called, relayed by the worker.
 *
 * The worker exposes every tool as an SDK `customTool` whose body is a fetch
 * to this route, so the model gets a real tool-calling loop while the code
 * that touches data stays on this side of the wire.
 *
 *   { "turnId": "…", "name": "search_work_history", "args": { … } }
 *
 * Reads come back with data. Writes come back `pending` — the row is parked
 * for approval and the model is told plainly that nothing has happened yet.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const turnId = readString(body, "turnId")
  const name = readString(body, "name")
  if (!turnId || !name) {
    return NextResponse.json(
      { error: "Send `turnId` and `name`." },
      { status: 400 }
    )
  }

  const outcome = await invokeTool({
    userId: caller.userId,
    turnId,
    name,
    args:
      body.args && typeof body.args === "object"
        ? (body.args as Record<string, unknown>)
        : {},
  })

  if (outcome.status === "pending") revalidatePath("/chat")

  return NextResponse.json(outcome)
}
