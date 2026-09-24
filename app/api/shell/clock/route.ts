import { NextResponse } from "next/server"
import { liveRecordingNow } from "@/lib/meeting-note-actions"
import { runningNow } from "@/lib/punch-actions"

export const dynamic = "force-dynamic"

/**
 * The floating clock's poll — the running punches and the live recording.
 * A GET rather than the server actions it wraps: Next 14 runs server actions
 * through the router's one queue, so a poll that fired as you clicked a link
 * held the navigation until it answered. A fetch never touches that queue.
 */
export async function GET() {
  const [running, recording] = await Promise.all([runningNow(), liveRecordingNow()])
  return NextResponse.json({ running, recording }, { headers: { "cache-control": "no-store" } })
}
