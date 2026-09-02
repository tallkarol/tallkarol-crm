import { scopeAdsSnapshot } from "@/lib/insights/ads-split"
import type { ArchivePayload, SnapshotV2 } from "@/lib/insights/types"

function cell(value: string | number | null | undefined) {
  if (value == null) return ""
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: (string | number | null)[][]) {
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n"
}

export const CSV_TABLES = [
  "daily",
  "queries",
  "search-pages",
  "channels",
  "pages",
  "events",
  "devices",
  "countries",
  "campaigns",
] as const
export type CsvTable = (typeof CSV_TABLES)[number]

export function isCsvTable(value: string): value is CsvTable {
  return (CSV_TABLES as readonly string[]).includes(value)
}

/** A frozen month exports through the same table renderer. */
export function archiveCsv(payload: ArchivePayload, table: CsvTable): string {
  const pseudo = {
    daily: payload.daily,
    ga4: payload.ga4,
    gsc: payload.gsc,
    ads: payload.ads,
  } as SnapshotV2
  return snapshotCsv(scopeAdsSnapshot(pseudo, { slug: payload.siteSlug }), table)
}

/** Render one snapshot table as CSV. Reads the cache only — no Google calls. */
export function snapshotCsv(snapshot: SnapshotV2, table: CsvTable): string {
  switch (table) {
    case "daily":
      return toCsv(
        [
          "date",
          "users",
          "sessions",
          "new_users",
          "events",
          "key_events",
          "clicks",
          "impressions",
          "position",
          "ad_impressions",
          "ad_clicks",
          "ad_spend",
          "ad_conversions",
          "ga4_paid",
          "ga4_organic",
          "vercel_pageviews",
          "vercel_visitors",
        ],
        snapshot.daily.map((p) => [
          p.date,
          p.users,
          p.sessions,
          p.newUsers,
          p.eventCount,
          p.keyEvents,
          p.clicks,
          p.impressions,
          p.position == null ? null : Number(p.position.toFixed(1)),
          p.adImpressions ?? 0,
          p.adClicks ?? 0,
          Number((p.adSpend ?? 0).toFixed(2)),
          Number((p.adConversions ?? 0).toFixed(2)),
          p.ga4Paid ?? 0,
          p.ga4Organic ?? 0,
          p.vercelPageviews ?? 0,
          p.vercelVisitors ?? 0,
        ])
      )
    case "queries":
    case "search-pages": {
      const rows = table === "queries" ? snapshot.gsc.queries : snapshot.gsc.pages
      return toCsv(
        [table === "queries" ? "query" : "page", "clicks", "impressions", "ctr", "position", "prev_position"],
        rows.map((r) => [
          r.name,
          r.clicks,
          r.impressions,
          Number((r.ctr * 100).toFixed(2)),
          Number(r.position.toFixed(1)),
          r.prevPosition == null ? null : Number(r.prevPosition.toFixed(1)),
        ])
      )
    }
    case "channels":
      return toCsv(["source_medium", "sessions"], snapshot.ga4.channels.map((r) => [r.name, r.value]))
    case "pages":
      return toCsv(
        ["landing_page", "sessions", "key_events"],
        snapshot.ga4.pages.map((r) => [r.name, r.sessions, r.keyEvents])
      )
    case "events":
      return toCsv(["event", "count"], snapshot.ga4.events.map((r) => [r.name, r.value]))
    case "devices":
      return toCsv(["device", "sessions"], snapshot.ga4.devices.map((r) => [r.name, r.value]))
    case "countries":
      return toCsv(["country", "sessions"], snapshot.ga4.countries.map((r) => [r.name, r.value]))
    case "campaigns":
      return toCsv(
        ["campaign", "status", "impressions", "clicks", "spend", "conversions"],
        (snapshot.ads?.campaigns ?? []).map((r) => [
          r.name,
          r.status,
          r.impressions,
          r.clicks,
          Number(r.spend.toFixed(2)),
          Number(r.conversions.toFixed(2)),
        ])
      )
  }
}
