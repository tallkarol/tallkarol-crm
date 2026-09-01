import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"
import { widgetClients } from "@/lib/widget"

export const dynamic = "force-dynamic"

/**
 * Feeds the client widget's configuration picker. WidgetKit asks for this
 * before any client has been chosen, so it must answer on an unconfigured
 * widget — id, name and slug only, nothing worth caching on the device.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const clients = await widgetClients()
  return NextResponse.json(
    { generatedAt: new Date().toISOString(), clients },
    { headers: { "cache-control": "no-store" } }
  )
}
