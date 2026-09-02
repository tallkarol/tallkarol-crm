import { NextResponse } from "next/server"
import { RUN_STATUSES, type RunStatus } from "@/lib/punchlist"
import { listRuns, runJson } from "@/lib/punchlists"
import { authenticateTimeRequest, badRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The queue the Mac polls: `punchlist tests --pending` reads
 * GET ?status=queued[&client=<slug>] and claims each run it is going to work.
 */
export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const url = new URL(request.url)
  const status = url.searchParams.get("status")?.trim() || "queued"
  if (!RUN_STATUSES.includes(status as RunStatus)) {
    return badRequest(`status must be one of ${RUN_STATUSES.join(", ")}.`)
  }
  const client = url.searchParams.get("client")?.trim() || null
  const runs = await listRuns({ status: status as RunStatus, clientSlug: client })
  return NextResponse.json(
    { runs: runs.map(runJson) },
    { headers: { "cache-control": "no-store" } }
  )
}
