import type { Site } from "@/db/schema"
import { ANALYTICS_SCOPES } from "@/lib/analytics"
import { googleAccessToken, googleAuthConfigured } from "@/lib/google-auth"
import { addDays, dayAxis, EMPTY_DAY, todayKey } from "@/lib/insights/derive"
import { INSIGHT_SOURCES, type SourceContext } from "@/lib/insights/sources"
import {
  EMPTY_GA4,
  INSIGHTS_DAYS,
  emptyGsc,
  type DailyPoint,
  type SnapshotV2,
} from "@/lib/insights/types"

/**
 * The only function that talks to the outside world. Runs every applicable
 * source adapter in parallel and merges their slices into one snapshot.
 * Called from the Refresh action — never from a page render.
 */
export async function loadSnapshotV2(site: Site): Promise<SnapshotV2> {
  const endDate = todayKey()
  const startDate = addDays(endDate, -(INSIGHTS_DAYS - 1))

  let token: string | null = null
  const needsGoogle = Boolean(site.ga4PropertyId || site.gscSiteUrl)
  if (needsGoogle && googleAuthConfigured()) {
    try {
      token = await googleAccessToken(ANALYTICS_SCOPES)
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
  for (const outcome of outcomes) {
    for (const row of outcome.ga4Daily || []) {
      const point = byDate.get(row.date)
      if (!point) continue
      point.users = row.users
      point.sessions = row.sessions
      point.newUsers = row.newUsers
      point.eventCount = row.eventCount
      point.keyEvents = row.keyEvents
    }
    for (const row of outcome.gscDaily || []) {
      const point = byDate.get(row.date)
      if (!point) continue
      point.clicks = row.clicks
      point.impressions = row.impressions
      point.position = row.position
    }
  }

  const snapshot: SnapshotV2 = {
    version: 2,
    fetchedAt: new Date().toISOString(),
    days: INSIGHTS_DAYS,
    daily: Array.from(byDate.values()),
    ga4: { ...EMPTY_GA4, error: site.ga4PropertyId ? null : "No GA4 property on this site." },
    gsc: emptyGsc(site.gscSiteUrl),
    health: outcomes.map((outcome) => outcome.health),
  }
  for (const outcome of outcomes) {
    if (outcome.ga4) snapshot.ga4 = outcome.ga4
    if (outcome.gsc) snapshot.gsc = outcome.gsc
  }
  return snapshot
}
