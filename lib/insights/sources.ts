import type { Site } from "@/db/schema"
import { probeCollector, validateMeasurementProtocol } from "@/lib/analytics"
import {
  fetchUptimeMonitor,
  formatRatio,
  statusLabel,
  uptimeRobotConfigured,
} from "@/lib/uptimerobot"
import { ga4Date, ga4Post, gscQuery, num, type Ga4Report } from "@/lib/insights/google"
import { addDays } from "@/lib/insights/derive"
import {
  EMPTY_GA4,
  INSIGHTS_DAYS,
  TABLE_WINDOW_DAYS,
  emptyGsc,
  type DimRow,
  type Ga4Block,
  type GscBlock,
  type PageRow,
  type SearchRow,
  type SourceHealth,
} from "@/lib/insights/types"

/**
 * Every data source the hub reads is one of these. The loader runs all that
 * apply, merges their slices into the snapshot, and lists their health rows.
 * Adding a source later (DataForSEO, CrUX, Resend…) means adding one entry
 * here — the page, the Health tab, and the refresh action pick it up.
 * UptimeRobot is already one of those entries.
 */
export interface InsightSource {
  id: string
  label: string
  appliesTo(site: Site): boolean
  run(site: Site, ctx: SourceContext): Promise<SourceOutcome>
}

export type SourceContext = {
  /** Google service-account token; null when the account is not configured. */
  token: string | null
  /** The daily series covers [startDate, endDate], ending today. */
  endDate: string
  startDate: string
}

export type Ga4DailyRow = {
  date: string
  users: number
  sessions: number
  newUsers: number
  eventCount: number
  keyEvents: number
}

export type GscDailyRow = {
  date: string
  clicks: number
  impressions: number
  position: number | null
}

export type SourceOutcome = {
  health: SourceHealth
  ga4?: Ga4Block
  gsc?: GscBlock
  ga4Daily?: Ga4DailyRow[]
  gscDaily?: GscDailyRow[]
}

function rowsToDims(report: Ga4Report | null): DimRow[] {
  if (!report?.rows) return []
  return report.rows
    .map((row) => ({
      name: row.dimensionValues?.[0]?.value || "(not set)",
      value: num(row.metricValues?.[0]?.value),
    }))
    .filter((row) => row.name && row.name !== "(other)")
}

export type Ga4Tables = Pick<
  Ga4Block,
  "channels" | "pages" | "events" | "devices" | "countries"
>

/**
 * Dimensional breakdowns for an explicit date range. The live snapshot uses
 * the fixed 28-day window; month archives call this again with the month's
 * own range so a frozen report never mixes months.
 */
export async function fetchGa4Tables(
  token: string,
  propertyId: string,
  range: { startDate: string; endDate: string }
): Promise<Ga4Tables> {
  const dim = (dimension: string, metric: string, limit: number) =>
    ga4Post(token, propertyId, "runReport", {
      dateRanges: [range],
      dimensions: [{ name: dimension }],
      metrics: [{ name: metric }],
      orderBys: [{ metric: { metricName: metric }, desc: true }],
      limit,
    })
  const pagesReq = (withKeyEvents: boolean) =>
    ga4Post(token, propertyId, "runReport", {
      dateRanges: [range],
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [
        { name: "sessions" },
        ...(withKeyEvents ? [{ name: "keyEvents" }] : []),
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 25,
    })

  const [channels, pages, events, devices, countries] = await Promise.all([
    dim("sessionSourceMedium", "sessions", 25),
    pagesReq(true).catch(() => pagesReq(false)),
    dim("eventName", "eventCount", 25),
    dim("deviceCategory", "sessions", 5),
    dim("country", "sessions", 10),
  ])

  const pageRows: PageRow[] = (pages.rows || [])
    .map((row) => ({
      name: row.dimensionValues?.[0]?.value || "(not set)",
      sessions: num(row.metricValues?.[0]?.value),
      keyEvents: row.metricValues?.[1] ? num(row.metricValues[1]?.value) : 0,
    }))
    .filter((row) => row.name !== "(other)")

  return {
    channels: rowsToDims(channels),
    pages: pageRows,
    events: rowsToDims(events),
    devices: rowsToDims(devices),
    countries: rowsToDims(countries),
  }
}

function toSearchRows(
  rows:
    | { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[]
    | undefined,
  prev: Map<string, number>
): SearchRow[] {
  return (rows || []).map((row) => {
    const name = row.keys?.[0] || "(not set)"
    return {
      name,
      clicks: num(row.clicks),
      impressions: num(row.impressions),
      ctr: num(row.ctr),
      position: num(row.position),
      prevPosition: prev.get(name) ?? null,
    }
  })
}

export type GscTables = Pick<GscBlock, "queries" | "pages">

/**
 * Query/page tables for an explicit window, with position deltas against the
 * window before it. Shared by the live snapshot and month archives.
 */
export async function fetchGscTables(
  token: string,
  siteUrl: string,
  win: { start: string; end: string; prevStart: string; prevEnd: string }
): Promise<GscTables> {
  const [queries, prevQueries, pages, prevPages] = await Promise.all([
    gscQuery(token, siteUrl, { startDate: win.start, endDate: win.end, dimensions: ["query"], rowLimit: 25 }),
    gscQuery(token, siteUrl, { startDate: win.prevStart, endDate: win.prevEnd, dimensions: ["query"], rowLimit: 100 }),
    gscQuery(token, siteUrl, { startDate: win.start, endDate: win.end, dimensions: ["page"], rowLimit: 25 }),
    gscQuery(token, siteUrl, { startDate: win.prevStart, endDate: win.prevEnd, dimensions: ["page"], rowLimit: 100 }),
  ])
  const prevQ = new Map((prevQueries.rows || []).map((r) => [r.keys?.[0] || "", num(r.position)]))
  const prevP = new Map((prevPages.rows || []).map((r) => [r.keys?.[0] || "", num(r.position)]))
  return {
    queries: toSearchRows(queries.rows, prevQ),
    pages: toSearchRows(pages.rows, prevP),
  }
}

const ga4Source: InsightSource = {
  id: "ga4",
  label: "GA4 Data API",
  appliesTo: (site) => Boolean(site.ga4PropertyId),
  async run(site, ctx) {
    if (!ctx.token) {
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: false,
          detail: "Add a Google service account to read GA4 reports.",
        },
        ga4: { ...EMPTY_GA4, error: "Service account is not connected." },
      }
    }
    const pid = site.ga4PropertyId
    const t = ctx.token
    try {
      // keyEvents only exists once a key event is marked — fall back without it.
      const dailyReq = (withKeyEvents: boolean) =>
        ga4Post(t, pid, "runReport", {
          dateRanges: [{ startDate: ctx.startDate, endDate: ctx.endDate }],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "activeUsers" },
            { name: "sessions" },
            { name: "newUsers" },
            { name: "eventCount" },
            ...(withKeyEvents ? [{ name: "keyEvents" }] : []),
          ],
          orderBys: [{ dimension: { dimensionName: "date" } }],
          limit: INSIGHTS_DAYS + 2,
        })

      const [daily, live, liveEvents, tables] = await Promise.all([
        dailyReq(true).catch(() => dailyReq(false)),
        ga4Post(t, pid, "runRealtimeReport", { metrics: [{ name: "activeUsers" }] }),
        ga4Post(t, pid, "runRealtimeReport", {
          metrics: [{ name: "eventCount" }],
          dimensions: [{ name: "eventName" }],
        }),
        fetchGa4Tables(t, pid, {
          startDate: addDays(ctx.endDate, -(TABLE_WINDOW_DAYS - 1)),
          endDate: ctx.endDate,
        }),
      ])

      const ga4Daily: Ga4DailyRow[] = (daily.rows || []).map((row) => ({
        date: ga4Date(row.dimensionValues?.[0]?.value),
        users: num(row.metricValues?.[0]?.value),
        sessions: num(row.metricValues?.[1]?.value),
        newUsers: num(row.metricValues?.[2]?.value),
        eventCount: num(row.metricValues?.[3]?.value),
        keyEvents: row.metricValues?.[4] ? num(row.metricValues[4]?.value) : 0,
      }))

      return {
        health: { id: this.id, label: this.label, ok: true, detail: "Reports are readable." },
        ga4Daily,
        ga4: {
          ok: true,
          error: null,
          realtimeUsers: num(
            live?.totals?.[0]?.metricValues?.[0]?.value ??
              live?.rows?.[0]?.metricValues?.[0]?.value
          ),
          realtimeEvents: rowsToDims(liveEvents),
          ...tables,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "GA4 Data API failed"
      return {
        health: { id: this.id, label: this.label, ok: false, detail: message },
        ga4: { ...EMPTY_GA4, error: message },
      }
    }
  },
}

const gscSource: InsightSource = {
  id: "gsc",
  label: "Search Console",
  appliesTo: (site) => Boolean(site.gscSiteUrl),
  async run(site, ctx) {
    if (!ctx.token) {
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: false,
          detail: "Add a Google service account to read Search Console.",
        },
        gsc: { ...emptyGsc(site.gscSiteUrl), error: "Service account is not connected." },
      }
    }
    const t = ctx.token
    const url = site.gscSiteUrl
    try {
      const [daily, tables] = await Promise.all([
        gscQuery(t, url, {
          startDate: ctx.startDate,
          endDate: ctx.endDate,
          dimensions: ["date"],
          rowLimit: INSIGHTS_DAYS + 2,
        }),
        fetchGscTables(t, url, {
          start: addDays(ctx.endDate, -(TABLE_WINDOW_DAYS - 1)),
          end: ctx.endDate,
          prevStart: addDays(ctx.endDate, -(TABLE_WINDOW_DAYS * 2 - 1)),
          prevEnd: addDays(ctx.endDate, -TABLE_WINDOW_DAYS),
        }),
      ])

      const gscDaily: GscDailyRow[] = (daily.rows || []).map((row) => ({
        date: row.keys?.[0] || "",
        clicks: num(row.clicks),
        impressions: num(row.impressions),
        position: row.position == null ? null : num(row.position),
      }))

      return {
        health: { id: this.id, label: this.label, ok: true, detail: `Reading ${url}` },
        gscDaily,
        gsc: { ok: true, error: null, siteUrl: url, ...tables },
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Search Console is not linked for this service account."
      return {
        health: { id: this.id, label: this.label, ok: false, detail: message },
        gsc: { ...emptyGsc(url), error: message },
      }
    }
  },
}

const collectorSource: InsightSource = {
  id: "collector",
  label: "First-party collector",
  appliesTo: (site) => Boolean(site.origin && site.measurementId),
  async run(site) {
    const probe = await probeCollector(site.origin)
    const live = probe.script && probe.endpoint
    return {
      health: {
        id: this.id,
        label: this.label,
        ok: live,
        detail: live
          ? probe.configured === false
            ? "Script and /api/collect respond, but the site is missing GA4_MEASUREMENT_ID or GA4_API_SECRET."
            : `tk-collect.js and /api/collect respond on ${site.origin}.`
          : `${site.origin} does not serve /tk-collect.js and /api/collect yet.`,
      },
    }
  },
}

const uptimeSource: InsightSource = {
  id: "uptime",
  label: "UptimeRobot",
  appliesTo: (site) => Boolean(site.uptimeMonitorId),
  async run(site) {
    if (!uptimeRobotConfigured()) {
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: false,
          detail: "Add a read-only UPTIMEROBOT_API_KEY to read this monitor.",
        },
      }
    }
    try {
      const monitor = await fetchUptimeMonitor(site.uptimeMonitorId)
      if (!monitor) {
        return {
          health: {
            id: this.id,
            label: this.label,
            ok: false,
            detail: `No UptimeRobot monitor ${site.uptimeMonitorId}.`,
          },
        }
      }
      const up = monitor.status === "up"
      const ratio = formatRatio(monitor.ratio30)
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: up ? true : monitor.status === "paused" ? null : false,
          detail: up
            ? `${statusLabel(monitor.status)} · ${ratio} over 30 days` +
              (monitor.avgResponseMs != null
                ? ` · ${Math.round(monitor.avgResponseMs)} ms avg`
                : "")
            : `${statusLabel(monitor.status)} · ${ratio} over 30 days`,
        },
      }
    } catch (err) {
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: false,
          detail: err instanceof Error ? err.message : "UptimeRobot request failed.",
        },
      }
    }
  },
}

const mpSource: InsightSource = {
  id: "mp",
  label: "Measurement Protocol",
  appliesTo: (site) => Boolean(site.measurementId),
  async run(site) {
    const result = await validateMeasurementProtocol(site.measurementId, site.origin)
    return {
      health: {
        id: this.id,
        label: this.label,
        ok: result.configured ? result.valid : null,
        detail: result.message,
      },
    }
  },
}

/** Order controls the Health tab. New sources: append here. */
export const INSIGHT_SOURCES: InsightSource[] = [
  ga4Source,
  gscSource,
  collectorSource,
  mpSource,
  uptimeSource,
]
