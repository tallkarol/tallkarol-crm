import { NextResponse } from "next/server"
import { recordWorkerSeen } from "@/lib/chat/worker-status"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The worker's heartbeat.
 *
 * Deliberately separate from `/api/chat/queue`: polling the queue is how a
 * turn gets claimed, so a worker cannot use it to say "still alive, hands
 * full" without taking on more work. This says only that, and does nothing
 * else — it exists so the chat page can tell a thinking worker from an
 * absent one.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const worker = readString(body, "worker") ?? "unknown"

  await recordWorkerSeen(worker)

  return NextResponse.json({ ok: true })
}
