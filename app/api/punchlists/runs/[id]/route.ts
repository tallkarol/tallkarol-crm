import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { RUN_STATUSES, type RunStatus } from "@/lib/punchlist"
import { loadRun, runJson, transitionRun } from "@/lib/punchlists"
import type { PunchlistTestReport } from "@/db/schema"
import {
  authenticateTimeRequest,
  badRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(_request)
  if (!caller) return unauthorized()
  const run = await loadRun(params.id)
  if (!run) return NextResponse.json({ error: "That run does not exist." }, { status: 404 })
  return NextResponse.json({ run: runJson(run) }, { headers: { "cache-control": "no-store" } })
}

function cleanList(value: unknown, max = 40): string[] {
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string" && !!v.trim())
        .map((v) => v.trim().slice(0, 2000))
        .slice(0, max)
    : []
}

/**
 * Move a run along: claim it (`running`), then report (`pass | fail |
 * blocked`). A second claim by a different runner is 409 unless `force`.
 *
 * POST { status, runner?, verdict?, report?: { findings[], notCovered[],
 *        evidence[], fixes[], raw? }, sessionRef?, force? }
 * 200 { run, replayed }
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const status = readString(body, "status")
  if (!status || !RUN_STATUSES.includes(status as RunStatus)) {
    return badRequest(`status must be one of ${RUN_STATUSES.join(", ")}.`)
  }

  let report: PunchlistTestReport | null = null
  if (body.report && typeof body.report === "object" && !Array.isArray(body.report)) {
    const raw = body.report as Record<string, unknown>
    report = {
      findings: cleanList(raw.findings),
      notCovered: cleanList(raw.notCovered),
      evidence: cleanList(raw.evidence),
      fixes: cleanList(raw.fixes),
      raw: typeof raw.raw === "string" ? raw.raw.slice(0, 20_000) : undefined,
    }
  }

  const result = await transitionRun(params.id, {
    status: status as RunStatus,
    runner: readString(body, "runner"),
    verdict: readString(body, "verdict"),
    report,
    sessionRef: readString(body, "sessionRef"),
    force: body.force === true,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const run = await loadRun(params.id)
  if (run) {
    revalidatePath(ROUTES.punchlist(run.item.punchlist.slug))
    revalidatePath(ROUTES.punchlists)
  }
  return NextResponse.json({ run: run ? runJson(run) : null, replayed: result.data.replayed })
}
