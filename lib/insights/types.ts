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

export type SnapshotV2 = {
  version: 2
  fetchedAt: string
  /** Length of the daily series fetched (calendar days ending today). */
  days: number
  daily: DailyPoint[]
  ga4: Ga4Block
  gsc: GscBlock
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
}
