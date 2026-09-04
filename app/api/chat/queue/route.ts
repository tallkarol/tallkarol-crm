import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages } from "@/db/schema"
import { asc } from "drizzle-orm"
import { modelFor, type ModelKey } from "@/lib/chat/models"
import { claimTurn, markRunning } from "@/lib/chat/turns"
import { toolSchemas } from "@/lib/chat/tools"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The worker's door.
 *
 * POST claims the oldest queued turn and hands back everything needed to run
 * it: the thread so far, the tool list, and the model the CRM already chose.
 * The worker does not get to pick the model — routing, the ladder and the
 * budget gate all live on this side, where they can be audited.
 *
 * Auth is a device token, same as every other machine caller.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const worker = readString(body, "worker") ?? "unknown"

  const turn = await claimTurn(worker)
  if (!turn) return NextResponse.json({ turn: null }, { status: 200 })

  const history = await db.query.chatMessages.findMany({
    where: eq(chatMessages.threadId, turn.threadId),
    orderBy: [asc(chatMessages.createdAt)],
    limit: 60,
  })

  await markRunning(turn.id)

  const spec = modelFor(turn.model as ModelKey)

  return NextResponse.json({
    turn: {
      id: turn.id,
      threadId: turn.threadId,
      jobType: turn.jobType,
      rung: turn.rung,
      detector: turn.detector,
      escalatedFrom: turn.escalatedFrom,
      model: spec?.id ?? turn.model,
      modelKey: turn.model,
      effort: turn.effort,
      pool: turn.pool,
    },
    messages: history.map((m) => ({
      role: m.role,
      agent: m.agent,
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
    tools: toolSchemas(),
  })
}
