import { NextResponse } from "next/server"
import { meetingsInWindow } from "@/lib/calendar-actions"

export const dynamic = "force-dynamic"

/**
 * The dashboard calendar's ‹ › paging, as a GET — see ../../shell/clock/route.ts
 * for why. The card also prefetches the window on each side, and a server
 * action doing that would sit in the router's queue ahead of the next pin or
 * link click (and a click during it would cost a full refresh afterwards).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const result = await meetingsInWindow(params.get("from") ?? "", params.get("to") ?? "")
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } })
}
