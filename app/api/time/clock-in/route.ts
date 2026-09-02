import { NextResponse } from "next/server"
import { clockIn } from "@/lib/punches"
import type { PunchSource } from "@/lib/punch"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

const SOURCES: PunchSource[] = ["api", "watch", "web"]

/**
 * Start a punch.
 *
 * { projectId?, clientId?, note?, at?, switch?, source?, clientRequestId? }
 *
 * Send either a projectId or a clientId — a project implies its own client.
 * Other punches keep running alongside this one; `switch: true` stops them
 * first. 409 with the open punch when this exact target is already running.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const source = readString(body, "source")

  const result = await clockIn({
    userId: caller.userId,
    deviceId: caller.deviceId,
    clientId: readString(body, "clientId"),
    projectId: readString(body, "projectId"),
    note: readString(body, "note") ?? "",
    at: body.at,
    switchRunning: body.switch === true,
    source: SOURCES.includes(source as PunchSource)
      ? (source as PunchSource)
      : caller.deviceId
        ? "api"
        : "web",
    clientRequestId: readString(body, "clientRequestId"),
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, running: result.running ?? null },
      { status: result.status }
    )
  }

  return NextResponse.json(
    { punch: result.data.punch, stopped: result.data.stopped },
    { status: 201 }
  )
}
