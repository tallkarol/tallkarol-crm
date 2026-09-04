import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { send } from "@/lib/chat/turns"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Say something.
 *
 * Queues a turn and returns immediately with the routing decision — which
 * ladder the request landed on, which model will run it and out of which
 * pool. The answer arrives when a worker finishes and posts to
 * /api/chat/turns/[id]; the page polls for it.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const text = readString(body, "text")
  if (!text) {
    return NextResponse.json({ error: "Send `text`." }, { status: 400 })
  }

  const result = await send({
    userId: caller.userId,
    threadId: readString(body, "threadId"),
    text,
  })

  revalidatePath("/chat")

  return NextResponse.json(
    {
      threadId: result.threadId,
      messageId: result.messageId,
      turn: {
        id: result.turn.id,
        status: result.turn.status,
        jobType: result.turn.jobType,
        model: result.turn.model,
        effort: result.turn.effort,
        pool: result.turn.pool,
        rung: result.turn.rung,
      },
      routing: {
        job: result.routing.job,
        downgradedFrom: result.routing.downgradedFrom ?? null,
        notice: result.routing.notice ?? null,
      },
    },
    { status: 201 }
  )
}
