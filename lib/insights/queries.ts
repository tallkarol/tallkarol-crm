import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { sites } from "@/db/schema"
import { insightsCacheKey, type SnapshotV2 } from "@/lib/insights/types"
import { readReport } from "@/lib/report-cache"

/** Everything a hub page needs about one property, in one read. */
export async function getInsightsContext(slug: string) {
  const site = await db.query.sites.findFirst({
    where: eq(sites.slug, slug),
    with: { client: true },
  })
  if (!site) return null
  const cached = await readReport<SnapshotV2>(insightsCacheKey(slug))
  const snapshot =
    cached.payload && cached.payload.version === 2 ? cached.payload : null
  return {
    site,
    snapshot,
    refreshedAt: cached.refreshedAt?.toISOString() ?? null,
  }
}

export async function getAllSites() {
  return db.query.sites.findMany({
    with: { client: true },
    orderBy: [asc(sites.sort), asc(sites.name)],
  })
}

/** The house property first, else the lowest sort — the hub's default view. */
export async function getDefaultSiteSlug() {
  const all = await getAllSites()
  const house = all.find((site) => site.clientId == null)
  return (house ?? all[0])?.slug ?? null
}
