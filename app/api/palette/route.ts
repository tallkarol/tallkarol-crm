import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { loadPalette } from "@/lib/palette-data"

export const dynamic = "force-dynamic"

/**
 * ⌘K's records, fetched when the palette first opens. A GET rather than a
 * server action for the reason in ../shell/clock/route.ts: an action waits in
 * the router's one queue, and this must never hold a navigation.
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  return NextResponse.json(await loadPalette(user.id), { headers: { "cache-control": "no-store" } })
}
