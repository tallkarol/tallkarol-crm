import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Railway's readiness probe. Deliberately touches nothing — no database, no
 * session — so it answers the moment the server is listening and a flaky
 * dependency can never make a deploy wait on it. What it proves is that the
 * new container serves HTTP, which is all the deploy overlap needs to know
 * before traffic moves and the old container drains.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } }
  )
}
