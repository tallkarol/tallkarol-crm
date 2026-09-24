import { NextResponse } from "next/server"
import { deskBadges } from "@/lib/chat/dock-actions"

export const dynamic = "force-dynamic"

/** The desk dock's 30s badge poll, as a GET — see ../clock/route.ts for why. */
export async function GET() {
  return NextResponse.json(await deskBadges(), { headers: { "cache-control": "no-store" } })
}
