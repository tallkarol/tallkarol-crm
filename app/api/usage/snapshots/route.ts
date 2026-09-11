import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { usageSnapshots } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { authenticateTimeRequest, badRequest, readJson, unauthorized } from "@/lib/time-api"
import { SNAPSHOT_SOURCES, type SnapshotSource } from "@/lib/usage/snapshots"
import { FUTURE_TOLERANCE_MS } from "@/lib/usage/time"

export const dynamic = "force-dynamic"

const BASES = ["cli", "api", "manual"] as const
/** A provider's JSON is a few KB; anything near this is not a reading. */
const MAX_PAYLOAD_BYTES = 64 * 1024

/**
 * A reading of a cap or a bill, stored verbatim: what `railway usage --json`
 * printed, what Karol typed from Claude Code's /usage or cursor.com. The
 * /usage page reads the newest row per source and prints its age — a
 * collector that stops shows as stale, never as zero.
 *
 * POST { source, basis?, observedAt, periodStart?, periodEnd?, payload, note? }
 *   or { snapshots: [ ...same objects ] } up to 50.
 * 200 { stored: n } — a repeat of (source, observedAt) is ignored.
 */

const MAX = 50

function str(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null
}

function dateOnly(v: unknown): string | null {
  const s = str(v, 10)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const list = Array.isArray(body.snapshots) ? (body.snapshots as Record<string, unknown>[]) : [body]
  if (!list.length) return badRequest("Send a snapshot or `snapshots`.")
  if (list.length > MAX) return badRequest(`At most ${MAX} snapshots per call.`)

  const rows = []
  for (const s of list) {
    const source = str(s.source, 40)
    if (!source || !(SNAPSHOT_SOURCES as readonly string[]).includes(source)) {
      return badRequest(`\`source\` must be one of ${SNAPSHOT_SOURCES.join(", ")}.`)
    }
    const observedAt = typeof s.observedAt === "string" ? new Date(s.observedAt) : null
    if (!observedAt || Number.isNaN(observedAt.getTime())) return badRequest("`observedAt` must be an ISO instant.")
    if (observedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      return badRequest("`observedAt` is in the future — a reading dated ahead would pin the tile.")
    }
    const payload = s.payload && typeof s.payload === "object" && !Array.isArray(s.payload) ? (s.payload as Record<string, unknown>) : null
    if (!payload) return badRequest("`payload` must be an object.")
    if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) return badRequest(`\`payload\` over ${MAX_PAYLOAD_BYTES / 1024} KB.`)
    const basis = str(s.basis, 20) ?? "manual"
    if (!(BASES as readonly string[]).includes(basis)) return badRequest(`\`basis\` must be one of ${BASES.join(", ")}.`)
    rows.push({
      source: source as SnapshotSource,
      basis,
      observedAt,
      periodStart: dateOnly(s.periodStart),
      periodEnd: dateOnly(s.periodEnd),
      payload,
      note: str(s.note, 300) ?? "",
      deviceId: caller.deviceId,
    })
  }

  const stored = await db
    .insert(usageSnapshots)
    .values(rows)
    .onConflictDoNothing({ target: [usageSnapshots.source, usageSnapshots.observedAt] })
    .returning({ id: usageSnapshots.id })
  revalidatePath(ROUTES.usage)
  return NextResponse.json({ stored: stored.length })
}
