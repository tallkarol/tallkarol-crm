import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"
import { widgetTickets } from "@/lib/widget"

export const dynamic = "force-dynamic"

/** Open tickets worst-overdue first, plus a short recently-closed tail. */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const now = new Date()
  const data = await widgetTickets(now)

  return NextResponse.json(
    { generatedAt: now.toISOString(), ...data },
    { headers: { "cache-control": "no-store" } }
  )
}
