/**
 * Insights hub snapshot, v2. One cached row per site under `insights:<slug>`
 * (the v1 `analytics:<slug>` rows are left untouched). The page never calls
 * Google — everything here is written by an explicit Refresh, and every
 * window/delta the UI shows is derived from `daily` in code.
 */

export type DailyPoint = {
  /** YYYY-MM-DD */
  date: string
  users: number
  sessions: number
  newUsers: number
  eventCount: number
  keyEvents: number
  clicks: number
  impressions: number
  /** GSC average position that day; null when Search Console had no row. */
  position: number | null
  adImpressions: number
  adClicks: number
  /** Account currency; cost_micros / 1e6. */
  adSpend: number
  adConversions: number
  /** GA4 sessions in paid channel groups — still consent-gated. */
  ga4Paid: number
  /** GA4 sessions in Organic Search — still consent-gated. */
  ga4Organic: number
  /** Vercel Web Analytics pageviews — cookieless host count. */
  vercelPageviews: number
  /** Vercel unique visitors for that calendar day (hash resets daily). */
  vercelVisitors: number
}

export type DimRow = { name: string; value: number }

export type PageRow = { name: string; sessions: number; keyEvents: number }

export type SearchRow = {
  name: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  /** Position over the previous window; null = did not rank then (new). */
  prevPosition: number | null
}

export type SourceHealth = {
  id: string
  label: string
  /** true = live, false = broken/missing, null = unknown or n/a. */
  ok: boolean | null
  detail: string
}

export type Ga4Block = {
  ok: boolean
  error: string | null
  realtimeUsers: number | null
  realtimeEvents: DimRow[]
  /** Dimensional tables cover the fixed 28-day fetch window (labeled in UI). */
  channels: DimRow[]
  pages: PageRow[]
  events: DimRow[]
  devices: DimRow[]
  countries: DimRow[]
}

export type GscBlock = {
  ok: boolean
  error: string | null
  siteUrl: string
  queries: SearchRow[]
  pages: SearchRow[]
}

export type AdsCampaignRow = {
  id: string
  name: string
  status: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
}

export type AdsBlock = {
  ok: boolean
  error: string | null
  customerId: string
  accountName: string
  currency: string
  campaigns: AdsCampaignRow[]
}

export type VercelBlock = {
  ok: boolean
  error: string | null
  projectId: string
  pages: DimRow[]
  referrers: DimRow[]
  devices: DimRow[]
  countries: DimRow[]
}

export type PageSpeedScores = {
  /** Lighthouse category scores, 0–100; null when a category was absent. */
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
  /** CrUX field data (p75) — null when Google lacks real-user traffic. */
  lcpMs: number | null
  inpMs: number | null
  cls: number | null
}

export type PageSpeedBlock = {
  ok: boolean
  error: string | null
  url: string
  /** When the Lighthouse runs happened — PSI is a live audit, not a range. */
  fetchedAt: string
  mobile: PageSpeedScores | null
  desktop: PageSpeedScores | null
}

export type SnapshotV2 = {
  version: 2
  fetchedAt: string
  /** Length of the daily series fetched (calendar days ending today). */
  days: number
  daily: DailyPoint[]
  ga4: Ga4Block
  gsc: GscBlock
  ads: AdsBlock
  vercel: VercelBlock
  /** Optional — snapshots cached before the PageSpeed source lack it. */
  pagespeed?: PageSpeedBlock
  health: SourceHealth[]
}

export const INSIGHTS_DAYS = 90
/** The window the dimensional tables (channels, queries…) are fetched for. */
export const TABLE_WINDOW_DAYS = 28

export function insightsCacheKey(slug: string) {
  return `insights:${slug}`
}

export const EMPTY_GA4: Ga4Block = {
  ok: false,
  error: null,
  realtimeUsers: null,
  realtimeEvents: [],
  channels: [],
  pages: [],
  events: [],
  devices: [],
  countries: [],
}

export function emptyGsc(siteUrl: string): GscBlock {
  return { ok: false, error: null, siteUrl, queries: [], pages: [] }
}

export function emptyAds(customerId = ""): AdsBlock {
  return {
    ok: false,
    error: null,
    customerId,
    accountName: "",
    currency: "USD",
    campaigns: [],
  }
}

export function emptyVercel(projectId = ""): VercelBlock {
  return {
    ok: false,
    error: null,
    projectId,
    pages: [],
    referrers: [],
    devices: [],
    countries: [],
  }
}

export function emptyPageSpeed(url = ""): PageSpeedBlock {
  return {
    ok: false,
    error: null,
    url,
    fetchedAt: "",
    mobile: null,
    desktop: null,
  }
}

/** CRM slice — computed live from the local DB (never cached), house site only. */
export type CrmSlice = {
  inquiries: number
  fit: number
  topSource: string | null
  recent: {
    id: string
    name: string
    company: string | null
    createdAt: string
    sourceLabel: string | null
    qualification: string
  }[]
}

/** What a frozen month looks like inside snapshot_archive.payload. */
export type ArchivePayload = {
  version: 1
  siteName: string
  siteSlug: string
  period: string // 2026-08
  label: string // August 2026
  range: { start: string; end: string }
  partial: boolean
  generatedAt: string
  daily: DailyPoint[]
  totals: WindowTotals
  previous: WindowTotals | null
  ga4: Pick<Ga4Block, "ok" | "channels" | "pages" | "events" | "devices" | "countries">
  gsc: Pick<GscBlock, "ok" | "siteUrl" | "queries" | "pages">
  ads: Pick<AdsBlock, "ok" | "customerId" | "accountName" | "currency" | "campaigns">
  vercel?: Pick<VercelBlock, "ok" | "projectId" | "pages" | "referrers" | "devices" | "countries">
  /** Scores as of the freeze — PSI has no history, so this is that month's reading. */
  pagespeed?: PageSpeedBlock
  crm: CrmSlice | null
  health: SourceHealth[]
}

export type WindowTotals = {
  users: number
  sessions: number
  newUsers: number
  eventCount: number
  keyEvents: number
  clicks: number
  impressions: number
  /** Impressions-weighted GSC average position; null when no impressions. */
  avgPosition: number | null
  adImpressions: number
  adClicks: number
  adSpend: number
  adConversions: number
  ga4Paid: number
  ga4Organic: number
  vercelPageviews: number
  vercelVisitors: number
}
