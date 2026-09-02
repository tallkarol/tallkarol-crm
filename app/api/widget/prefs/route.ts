import { NextResponse } from "next/server"
import { NOTIFICATION_KINDS, getNotificationPrefs, kindEnabled } from "@/lib/notify"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"

export const dynamic = "force-dynamic"

/**
 * The notification switches, resolved. The Mac app reads these every poll so
 * its local notifications follow Settings → Notifications in the CRM — one
 * set of switches, not one per device.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const prefs = await getNotificationPrefs()
  const kinds: Record<string, boolean> = {}
  for (const spec of NOTIFICATION_KINDS) kinds[spec.kind] = kindEnabled(prefs, spec.kind)

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      kinds,
      quietFrom: prefs.quietFrom,
      quietTo: prefs.quietTo,
    },
    { headers: { "cache-control": "no-store" } }
  )
}
