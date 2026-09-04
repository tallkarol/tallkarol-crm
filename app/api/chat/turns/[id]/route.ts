import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { completeTurn, escalate, failTurn } from "@/lib/chat/turns"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The worker reports back.
 *
 *   { "body": "...", "usage": { ... } }            finished
 *   { "error": "...", "detector": "test suite" }   failed
 *
 * Tool calls do not arrive here — they happen mid-run through
 * /api/chat/tools, so a read the model made is already recorded by the time
 * this lands.
 *
 * A failure carrying a `detector` is evidence the model was too small, and
 * queues the next rung. A failure without one is an accident — a dropped
 * connection, a bad token — and stops there, because paying for a bigger
 * model to hit the same wall is how a ladder turns into a bonfire.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const error = readString(body, "error")

  if (error) {
    await failTurn(params.id, error)
    const detector = readString(body, "detector")
    const next = detector ? await escalate(params.id, detector) : null
    revalidatePath("/chat")
    return NextResponse.json({
      status: "failed",
      escalatedTo: next
        ? { id: next.id, model: next.model, effort: next.effort, rung: next.rung }
        : null,
    })
  }

  const text = readString(body, "body")
  if (text == null) {
    return NextResponse.json(
      { error: "Send `body`, or `error` with what went wrong." },
      { status: 400 }
    )
  }

  const usage = (body.usage ?? {}) as Record<string, unknown>
  const int = (key: string) =>
    typeof usage[key] === "number" ? (usage[key] as number) : 0

  const result = await completeTurn({
    turnId: params.id,
    body: text,
    usage: {
      inputTokens: int("inputTokens"),
      outputTokens: int("outputTokens"),
      cacheReadTokens: int("cacheReadTokens"),
      cacheWriteTokens: int("cacheWriteTokens"),
    },
  })

  revalidatePath("/chat")

  return NextResponse.json({
    status: "done",
    messageId: result.messageId,
    costCents: Number(result.costCents.toFixed(4)),
  })
}
