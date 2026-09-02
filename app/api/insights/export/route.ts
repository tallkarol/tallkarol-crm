import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { sites, snapshotArchive } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { getPortalScope } from "@/lib/portal"
import { archiveCsv, isCsvTable, snapshotCsv } from "@/lib/insights/csv"
import { insightsCacheKey, type ArchivePayload, type SnapshotV2 } from "@/lib/insights/types"
import { readReport } from "@/lib/report-cache"

export const dynamic = "force-dynamic"

/**
 * CSV of one snapshot table. `?site=&table=` exports the live snapshot;
 * add `&period=2026-08` to export a frozen month instead. Reads the local
 * cache/archive only — never Google.
 */
export async function GET(request: Request) {
  const user = await getSessionUser()

  const url = new URL(request.url)
  const slug = url.searchParams.get("site") || ""
  const table = url.searchParams.get("table") || ""
  const period = url.searchParams.get("period") || ""

  if (!isCsvTable(table)) {
    return new NextResponse("Unknown table.", { status: 400 })
  }
  const site = await db.query.sites.findFirst({ where: eq(sites.slug, slug) })
  if (!site) return new NextResponse("Site not found.", { status: 404 })

  // Admins export any site; portal customers only their own clients' sites.
  if (!user) {
    const scope = await getPortalScope()
    if (!scope) return new NextResponse("Sign in first.", { status: 401 })
    const allowed = site.clientId && scope.clients.some((c) => c.id === site.clientId)
    if (!allowed) return new NextResponse("Not your site.", { status: 403 })
  }

  let csv: string
  let stamp: string
  if (period) {
    const archive = await db.query.snapshotArchive.findFirst({
      where: and(eq(snapshotArchive.siteId, site.id), eq(snapshotArchive.period, period)),
    })
    if (!archive) return new NextResponse("No archive for that period.", { status: 404 })
    csv = archiveCsv(archive.payload as ArchivePayload, table)
    stamp = period
  } else {
    const cached = await readReport<SnapshotV2>(insightsCacheKey(site.slug))
    if (!cached.payload || cached.payload.version !== 2) {
      return new NextResponse("Fetch a snapshot first.", { status: 404 })
    }
    csv = snapshotCsv(cached.payload, table)
    stamp = cached.payload.fetchedAt.slice(0, 10)
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${site.slug}-${table}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
