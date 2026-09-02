import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import { widgetClock } from "@/lib/widget-clock"

export const dynamic = "force-dynamic"

/** What is running, what today adds up to, and what is worth punching next. */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const userId = await widgetUserId()
  if (!userId) return NextResponse.json({ error: "No admin user." }, { status: 500 })

  return NextResponse.json(await widgetClock(userId), {
    headers: { "cache-control": "no-store" },
  })
}
