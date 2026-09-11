import { NextResponse } from "next/server"
import { recordRecorderSeen } from "@/lib/meeting-notes"
import { authenticateTimeRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The meeting worker's heartbeat — alive, whether or not it is busy. The
 * Record panel reads it to tell "starting" from "nobody is listening".
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  await recordRecorderSeen(readString(body, "worker") ?? "unknown")
  return NextResponse.json({ ok: true })
}
