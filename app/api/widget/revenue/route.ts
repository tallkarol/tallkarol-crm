import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"
import { widgetRevenue } from "@/lib/widget-revenue"

export const dynamic = "force-dynamic"

/**
 * The three revenue dials, as ratios only — no cents in the response at all.
 * See `lib/widget-revenue.ts` for why.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const data = await widgetRevenue()
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } })
}
