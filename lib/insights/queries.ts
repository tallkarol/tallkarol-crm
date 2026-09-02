import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { sites } from "@/db/schema"
import { scopeAdsSnapshot } from "@/lib/insights/ads-split"
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
  const raw =
    cached.payload && cached.payload.version === 2 ? cached.payload : null
  const snapshot = raw ? scopeAdsSnapshot(raw, site) : null
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

/** Properties that have a Google Ads customer id attached. */
export async function getAdsSites() {
  const all = await getAllSites()
  return all.filter((site) => Boolean(site.adsCustomerId))
}

/** First Ads property in rail order — Paid Ads opens here. */
export async function getDefaultAdsSiteSlug() {
  const ads = await getAdsSites()
  return ads[0]?.slug ?? null
}
