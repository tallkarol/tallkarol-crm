import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"
import { agentWindowDays, widgetAgent } from "@/lib/widget-agent"

export const dynamic = "force-dynamic"

/**
 * The Agent Ledger: what the meters recorded over a rolling window, how much
 * of it reached a timesheet, and what is still waiting to be converted.
 *
 * `?days=` sets the window (default 7, clamped to 1..90). Read-only — the
 * conversion is a separate, deliberate tap at `POST /api/widget/agent/log`.
 *
 * Hours and ratios only. See `lib/widget-agent.ts` for why no rate crosses
 * this boundary.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const days = agentWindowDays(new URL(request.url).searchParams.get("days"))

  return NextResponse.json(await widgetAgent(days), {
    headers: { "cache-control": "no-store" },
  })
}
