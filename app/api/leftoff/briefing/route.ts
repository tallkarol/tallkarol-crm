import { NextResponse } from "next/server"
import { authenticateLeftOff, unauthorized } from "@/lib/leftoff-auth"
import { buildBriefingNow, sendBriefing } from "@/lib/leftoff-data"

export const dynamic = "force-dynamic"

/**
 * The morning briefing.
 *
 *   POST { trigger: "unlock" | "manual" } — build it, push it to the phones
 *   (once per day; a repeat returns sent:false), and return the lines so the
 *   Mac can show the same thing locally.
 *   GET — preview without sending.
 */
export async function POST(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()
  const result = await sendBriefing(new Date())
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()
  const result = await buildBriefingNow(new Date())
  return NextResponse.json({ ok: true, sent: false, ...result }, { headers: { "cache-control": "no-store" } })
}
