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
 *   { "body": "...", "usage": { ... }, "agent"?: "/inspect", "worker"?: "mac-1" }   finished
 *   { "error": "...", "detector": "test suite", "worker"?: "mac-1" }              failed
 *
 * A report lands once. The turn moves by compare-and-swap, so a retried
 * post, a late post from a restarted worker, or an error posted after a
 * success answers 409 and changes nothing — the reply already in the thread
 * stays the reply. `worker`, when sent, must match the name that claimed it.
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
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const error = readString(body, "error")
  const worker = readString(body, "worker") ?? undefined

  if (error) {
    const failed = await failTurn(params.id, error, worker)
    if (!failed) {
      return NextResponse.json({ status: "settled", error: "That turn was already settled." }, { status: 409 })
    }
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
    agent: readString(body, "agent") ?? undefined,
    worker,
    usage: {
      inputTokens: int("inputTokens"),
      outputTokens: int("outputTokens"),
      cacheReadTokens: int("cacheReadTokens"),
      cacheWriteTokens: int("cacheWriteTokens"),
    },
  })

  if (!result.ok) {
    return NextResponse.json({ status: "settled", error: result.reason }, { status: 409 })
  }

  revalidatePath("/chat")

  return NextResponse.json({
    status: "done",
    messageId: result.messageId,
    costCents: Number(result.costCents.toFixed(4)),
  })
}
