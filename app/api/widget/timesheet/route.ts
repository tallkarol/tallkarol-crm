import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import { widgetTimesheet } from "@/lib/widget-clock"

export const dynamic = "force-dynamic"

/** Today, the week, the month, the last seven days, and who they went to. */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const userId = await widgetUserId()
  if (!userId) return NextResponse.json({ error: "No admin user." }, { status: 500 })

  return NextResponse.json(await widgetTimesheet(userId), {
    headers: { "cache-control": "no-store" },
  })
}
