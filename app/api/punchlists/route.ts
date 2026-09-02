import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { createPunchlist, listPunchlists, type NewPunchlistItem } from "@/lib/punchlists"
import {
  authenticateTimeRequest,
  badRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A punch list from the `punchlist` skill in daedalus-hive-mind, after Karol
 * approved the proposal in chat. Lands `open` with one task per item made in
 * the same transaction; `status: "draft"` parks the items without tasks for
 * an Accept in the CRM.
 *
 * POST { title, clientSlug | clientId, projectSlug? | projectId?, intro?,
 *        sourceKind?, sourceRef?, sourceText?, generatedBy?, sessionRef?,
 *        status?: "open" | "draft", refKind, refId,
 *        items: [{ section?, title, kind?, reported?, outcome?, test? }] }
 *
 * 201 { id, slug, url, items: [{ itemId, taskId }] }. 200 with `replayed: true`
 * when the same refKind + refId was already filed — a retry never twins.
 *
 * GET ?client=<slug>&status=<open|draft|done|void> — summaries with progress.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const refKind = readString(body, "refKind")
  const refId = readString(body, "refId")
  if (refId && !UUID.test(refId)) return badRequest("`refId` must be a uuid.")
  if ((refKind && !refId) || (refId && !refKind)) {
    return badRequest("Send `refKind` and `refId` together — one without the other gives you no replay protection.")
  }
  if (!Array.isArray(body.items)) return badRequest("`items` must be an array.")

  const status = readString(body, "status")
  if (status && status !== "open" && status !== "draft") {
    return badRequest("`status` must be \"open\" or \"draft\".")
  }
  const result = await createPunchlist({
    title: readString(body, "title") ?? "",
    clientId: readString(body, "clientId"),
    clientSlug: readString(body, "clientSlug"),
    projectId: readString(body, "projectId"),
    projectSlug: readString(body, "projectSlug"),
    intro: readString(body, "intro") ?? "",
    sourceKind: readString(body, "sourceKind") ?? "doc",
    sourceRef: readString(body, "sourceRef") ?? "",
    sourceText: typeof body.sourceText === "string" ? body.sourceText : "",
    generatedBy: readString(body, "generatedBy") ?? "",
    sessionRef: readString(body, "sessionRef"),
    status: status === "draft" ? "draft" : "open",
    refKind,
    refId,
    items: body.items as NewPunchlistItem[],
    userId: caller.userId,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  revalidatePath(ROUTES.punchlists)
  revalidatePath(ROUTES.tasks)
  revalidatePath(ROUTES.home)

  return NextResponse.json(
    {
      id: result.data.id,
      slug: result.data.slug,
      url: ROUTES.punchlist(result.data.slug),
      items: result.data.items,
      replayed: result.data.replayed,
    },
    { status: result.data.replayed ? 200 : 201 }
  )
}

export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const url = new URL(request.url)
  const client = url.searchParams.get("client")?.trim() || null
  const status = url.searchParams.get("status")?.trim() || null
  const rows = (await listPunchlists()).filter(
    (row) =>
      (!client || row.client.slug === client) &&
      (!status || row.effectiveStatus === status)
  )
  return NextResponse.json(
    {
      punchlists: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        status: row.effectiveStatus,
        client: { slug: row.client.slug, name: row.client.name },
        project: row.project ? { slug: row.project.slug, name: row.project.name } : null,
        progress: row.progress,
        tests: row.testSummary,
        url: ROUTES.punchlist(row.slug),
        createdAt: row.createdAt,
      })),
    },
    { headers: { "cache-control": "no-store" } }
  )
}
