import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { punchlistItems } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { requestTestRun, setItemTest } from "@/lib/punchlists"
import { authenticateTimeRequest, readJson, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Attach (or clear) the test on one item, and/or queue a run.
 *
 * POST { test?: <spec> | null, request?: boolean } → 200 { spec, runId }
 * Omit `test` to leave the spec alone; `request: true` on its own re-queues
 * the item's current test (a blocked or failed run is retried this way).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const item = await db.query.punchlistItems.findFirst({
    where: eq(punchlistItems.id, params.itemId),
    with: { punchlist: { columns: { id: true, slug: true } } },
  })
  if (!item || item.punchlist.id !== params.id) {
    return NextResponse.json({ error: "That item does not exist." }, { status: 404 })
  }

  const body = await readJson(request)
  let spec = item.test ?? null
  if ("test" in body) {
    const result = await setItemTest(params.itemId, body.test)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    spec = result.data.spec
  }

  let runId: string | null = null
  if (body.request === true) {
    const run = await requestTestRun(params.itemId, caller.userId)
    if (!run.ok) return NextResponse.json({ error: run.error }, { status: run.status })
    runId = run.data.runId
  }

  revalidatePath(ROUTES.punchlist(item.punchlist.slug))
  return NextResponse.json({ spec, runId })
}
