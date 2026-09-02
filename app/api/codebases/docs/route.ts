import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { latestDoc, latestDocsFor, storeCodebaseDoc } from "@/lib/codebase-docs"
import {
  authenticateTimeRequest,
  badRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Generated codebase sheets from the daedalus-hive-mind tools (`spec-sheet`
 * first; folder structure, db, features, permissions later), on the device
 * token the clock uses.
 *
 * POST { clientSlug, codebase, kind, schemaVersion?, title?, summary?, data,
 *        commitHash?, branch?, tool?, sourcePath?, generatedAt?,
 *        siteSlug?, projectSlug?, productSlug? }
 * 201 with { id }. 200 with `replayed: true` when the same commit produced the
 * same data — a rerun with nothing changed stores nothing.
 *
 * GET ?client=<slug>[&codebase=<slug>&kind=<kind>] — the latest sheet, or all
 * of a client's latest sheets (without `data`) when codebase/kind are omitted.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const data = body.data
  if (!data || typeof data !== "object" || Array.isArray(data)) return badRequest("`data` must be an object.")
  const generatedRaw = readString(body, "generatedAt")
  const generatedAt = generatedRaw ? new Date(generatedRaw) : new Date()
  const schemaVersion = typeof body.schemaVersion === "number" ? Math.max(1, Math.floor(body.schemaVersion)) : 1

  const result = await storeCodebaseDoc({
    clientSlug: readString(body, "clientSlug") ?? "",
    codebase: readString(body, "codebase") ?? "",
    kind: readString(body, "kind") ?? "",
    schemaVersion,
    title: readString(body, "title") ?? "",
    summary: readString(body, "summary") ?? "",
    data: data as Record<string, unknown>,
    commitHash: readString(body, "commitHash") ?? "",
    branch: readString(body, "branch") ?? "",
    tool: readString(body, "tool") ?? "",
    sourcePath: readString(body, "sourcePath") ?? "",
    generatedAt,
    siteSlug: readString(body, "siteSlug"),
    projectSlug: readString(body, "projectSlug"),
    productSlug: readString(body, "productSlug"),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const client = await db.query.clients.findFirst({ where: eq(clients.id, result.clientId), columns: { slug: true } })
  if (client) {
    revalidatePath(`/clients/${client.slug}`)
    revalidatePath(`/clients/${client.slug}/codebases`)
  }
  return NextResponse.json(
    { id: result.id, replayed: result.replayed, url: client ? `/clients/${client.slug}/codebases/${readString(body, "codebase")}` : null },
    { status: result.replayed ? 200 : 201 }
  )
}

export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const params = new URL(request.url).searchParams
  const slug = params.get("client")?.trim()
  if (!slug) return badRequest("Send ?client=<slug>.")
  const client = await db.query.clients.findFirst({ where: eq(clients.slug, slug), columns: { id: true, slug: true, name: true } })
  if (!client) return NextResponse.json({ error: `No client with slug "${slug}".` }, { status: 404 })

  const codebase = params.get("codebase")?.trim()
  const kind = params.get("kind")?.trim()
  if (codebase && kind) {
    const doc = await latestDoc(client.id, codebase, kind)
    return NextResponse.json({ client, doc: doc ?? null }, { headers: { "cache-control": "no-store" } })
  }
  const docs = await latestDocsFor(client.id)
  return NextResponse.json(
    { client, docs: docs.map(({ data: _data, ...rest }) => rest) },
    { headers: { "cache-control": "no-store" } }
  )
}
