import type { Site } from "@/db/schema"
import { ANALYTICS_SCOPES } from "@/lib/analytics"
import { googleAccessToken, googleAuthConfigured } from "@/lib/google-auth"
import { ADS_SCOPE } from "@/lib/insights/google"
import { addDays, dayAxis, EMPTY_DAY, todayKey } from "@/lib/insights/derive"
import { INSIGHT_SOURCES, type SourceContext } from "@/lib/insights/sources"
import {
  EMPTY_GA4,
  INSIGHTS_DAYS,
  emptyAds,
  emptyGsc,
  emptyVercel,
  type DailyPoint,
  type SnapshotV2,
} from "@/lib/insights/types"

/**
 * The only function that talks to the outside world. Runs every applicable
 * source adapter in parallel and merges their slices into one snapshot.
 * Called from the Refresh action — never from a page render.
 */
export async function loadSnapshotV2(
  site: Site,
  previous?: SnapshotV2 | null
): Promise<SnapshotV2> {
  const endDate = todayKey()
  const startDate = addDays(endDate, -(INSIGHTS_DAYS - 1))

  let token: string | null = null
  const needsAds = Boolean(site.adsCustomerId)
  const needsGoogle = Boolean(site.ga4PropertyId || site.gscSiteUrl || needsAds)
  if (needsGoogle && googleAuthConfigured()) {
    try {
      token = await googleAccessToken(
        needsAds ? [...ANALYTICS_SCOPES, ADS_SCOPE] : ANALYTICS_SCOPES
      )
    } catch {
      token = null
    }
  }
  const ctx: SourceContext = { token, endDate, startDate }

  const applicable = INSIGHT_SOURCES.filter((source) => source.appliesTo(site))
  const outcomes = await Promise.all(applicable.map((source) => source.run(site, ctx)))

  // Merge daily slices onto a fixed 90-day axis, zero-filled.
  const byDate = new Map<string, DailyPoint>()
  for (const date of dayAxis(endDate, INSIGHTS_DAYS)) {
    byDate.set(date, { date, ...EMPTY_DAY })
  }
  const vercelFetched = new Set<string>()
  for (const outcome of outcomes) {
    for (const row of outcome.ga4Daily || []) {
      const point = byDate.get(row.date)
      if (!point) continue
      point.users = row.users
      point.sessions = row.sessions
      point.newUsers = row.newUsers
      point.eventCount = row.eventCount
      point.keyEvents = row.keyEvents
      point.ga4Paid = row.ga4Paid
      point.ga4Organic = row.ga4Organic
    }
    for (const row of outcome.gscDaily || []) {
      const point = byDate.get(row.date)
      if (!point) continue
      point.clicks = row.clicks
      point.impressions = row.impressions
      point.position = row.position
    }
    for (const row of outcome.adsDaily || []) {
      const point = byDate.get(row.date)
      if (!point) continue
      point.adImpressions = row.adImpressions
      point.adClicks = row.adClicks
      point.adSpend = row.adSpend
      point.adConversions = row.adConversions
    }
    for (const row of outcome.vercelDaily || []) {
      const point = byDate.get(row.date)
      if (!point) continue
      point.vercelPageviews = row.pageviews
      point.vercelVisitors = row.visitors
      vercelFetched.add(row.date)
    }
  }
  // Hobby only returns ~30 days. Keep earlier host days we already stored,
  // and keep the last good series if this refresh could not reach Vercel.
  if (previous) {
    for (const old of previous.daily) {
      if (vercelFetched.has(old.date)) continue
      const point = byDate.get(old.date)
      if (!point) continue
      point.vercelPageviews = old.vercelPageviews ?? 0
      point.vercelVisitors = old.vercelVisitors ?? 0
    }
  }

  const snapshot: SnapshotV2 = {
    version: 2,
    fetchedAt: new Date().toISOString(),
    days: INSIGHTS_DAYS,
    daily: Array.from(byDate.values()),
    ga4: { ...EMPTY_GA4, error: site.ga4PropertyId ? null : "No GA4 property on this site." },
    gsc: emptyGsc(site.gscSiteUrl),
    ads: emptyAds(site.adsCustomerId),
    vercel: emptyVercel(site.vercelProjectId),
    health: outcomes.map((outcome) => outcome.health),
  }
  for (const outcome of outcomes) {
    if (outcome.ga4) snapshot.ga4 = outcome.ga4
    if (outcome.gsc) snapshot.gsc = outcome.gsc
    if (outcome.ads) snapshot.ads = outcome.ads
    if (outcome.vercel) snapshot.vercel = outcome.vercel
  }
  return snapshot
}
