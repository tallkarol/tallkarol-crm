import type { Site } from "@/db/schema"
import { probeCollector, validateMeasurementProtocol } from "@/lib/analytics"
import {
  fetchUptimeMonitor,
  formatRatio,
  statusLabel,
  uptimeRobotConfigured,
} from "@/lib/uptimerobot"
import {
  adsSearch,
  ga4Date,
  ga4Post,
  gscQuery,
  microsToAmount,
  num,
  type Ga4Report,
} from "@/lib/insights/google"
import { addDays } from "@/lib/insights/derive"
import {
  fetchVercelAnalytics,
  vercelConfigured,
} from "@/lib/insights/vercel"
import {
  EMPTY_GA4,
  INSIGHTS_DAYS,
  TABLE_WINDOW_DAYS,
  emptyAds,
  emptyGsc,
  emptyVercel,
  type AdsBlock,
  type AdsCampaignRow,
  type DimRow,
  type Ga4Block,
  type GscBlock,
  type PageRow,
  type SearchRow,
  type SourceHealth,
  type VercelBlock,
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
  ga4Paid: number
  ga4Organic: number
}

export type GscDailyRow = {
  date: string
  clicks: number
  impressions: number
  position: number | null
}

export type AdsDailyRow = {
  date: string
  adImpressions: number
  adClicks: number
  adSpend: number
  adConversions: number
}

export type VercelDailyRow = {
  date: string
  pageviews: number
  visitors: number
}

export type SourceOutcome = {
  health: SourceHealth
  ga4?: Ga4Block
  gsc?: GscBlock
  ads?: AdsBlock
  ga4Daily?: Ga4DailyRow[]
  gscDaily?: GscDailyRow[]
  adsDaily?: AdsDailyRow[]
  vercel?: VercelBlock
  vercelDaily?: VercelDailyRow[]
}

/**
 * Traffic that is not a person considering the business.
 *
 * `syndicatedsearch.goog` is Google's search-syndication network — on
 * mycustommanufacturer.com it produced 49 of August's 203 sessions and 74 of
 * its 158 call-to-action clicks, and never once started a form. `localhost`
 * is a developer running the site with the production tag id attached.
 *
 * Left in, they do not just inflate totals: they land almost entirely on
 * top-of-funnel events, so every downstream rate is divided by a bigger number
 * than it should be. August's call-to-action-to-form-start rate reads 14.6%
 * with them and 26.2% without.
 *
 * Filtering here rather than in GA4 is deliberate — a GA4 data filter is not
 * retroactive, so it would clean the future and leave every historical
 * comparison dirty. This applies to the whole archive, every time it is read.
 */
const PAID_CHANNEL_GROUPS = new Set([
  "Paid Search",
  "Paid Social",
  "Paid Other",
  "Paid Video",
  "Display",
  "Cross-network",
])

function isPaidChannel(name: string) {
  return PAID_CHANNEL_GROUPS.has(name)
}

function isOrganicSearchChannel(name: string) {
  return name === "Organic Search"
}

const NOISE_SOURCE_FRAGMENTS = ["syndicatedsearch.goog", "localhost"] as const

/** GA4 dimensionFilter that drops NOISE_SOURCE_FRAGMENTS from any report. */
const EXCLUDE_NOISE = {
  notExpression: {
    orGroup: {
      expressions: NOISE_SOURCE_FRAGMENTS.map((value) => ({
        filter: {
          fieldName: "sessionSourceMedium",
          stringFilter: { matchType: "CONTAINS", value, caseSensitive: false },
        },
      })),
    },
  },
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
      dimensionFilter: EXCLUDE_NOISE,
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
      dimensionFilter: EXCLUDE_NOISE,
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
          dimensionFilter: EXCLUDE_NOISE,
          limit: INSIGHTS_DAYS + 2,
        })

      const [daily, live, liveEvents, tables, channelsDaily] = await Promise.all([
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
        ga4Post(t, pid, "runReport", {
          dateRanges: [{ startDate: ctx.startDate, endDate: ctx.endDate }],
          dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }],
          dimensionFilter: EXCLUDE_NOISE,
          limit: 2000,
        }).catch(() => null),
      ])

      const paidByDate = new Map<string, number>()
      const organicByDate = new Map<string, number>()
      for (const row of channelsDaily?.rows || []) {
        const date = ga4Date(row.dimensionValues?.[0]?.value)
        const channel = row.dimensionValues?.[1]?.value || ""
        const sessions = num(row.metricValues?.[0]?.value)
        if (isPaidChannel(channel)) {
          paidByDate.set(date, (paidByDate.get(date) || 0) + sessions)
        } else if (isOrganicSearchChannel(channel)) {
          organicByDate.set(date, (organicByDate.get(date) || 0) + sessions)
        }
      }

      const ga4Daily: Ga4DailyRow[] = (daily.rows || []).map((row) => {
        const date = ga4Date(row.dimensionValues?.[0]?.value)
        return {
          date,
          users: num(row.metricValues?.[0]?.value),
          sessions: num(row.metricValues?.[1]?.value),
          newUsers: num(row.metricValues?.[2]?.value),
          eventCount: num(row.metricValues?.[3]?.value),
          keyEvents: row.metricValues?.[4] ? num(row.metricValues[4]?.value) : 0,
          ga4Paid: paidByDate.get(date) || 0,
          ga4Organic: organicByDate.get(date) || 0,
        }
      })

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

export type AdsTables = Pick<AdsBlock, "campaigns">

export async function fetchAdsCampaigns(
  token: string,
  customerId: string,
  range: { startDate: string; endDate: string }
): Promise<AdsCampaignRow[]> {
  const rows = await adsSearch(
    token,
    `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${range.startDate}' AND '${range.endDate}' AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT 25`,
    customerId
  )
  return rows.map((row) => ({
    id: String(row.campaign?.id ?? ""),
    name: String(row.campaign?.name ?? "(untitled)"),
    status: String(row.campaign?.status ?? ""),
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
    spend: microsToAmount(row.metrics?.costMicros),
    conversions: num(row.metrics?.conversions),
  }))
}

const adsSource: InsightSource = {
  id: "ads",
  label: "Google Ads",
  appliesTo: (site) => Boolean(site.adsCustomerId),
  async run(site, ctx) {
    const customerId = site.adsCustomerId
    if (!ctx.token) {
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: false,
          detail: "Add a Google service account to read Google Ads.",
        },
        ads: { ...emptyAds(customerId), error: "Service account is not connected." },
      }
    }
    try {
      const [accountRows, dailyRows, campaigns] = await Promise.all([
        adsSearch(
          ctx.token,
          "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
          customerId
        ),
        adsSearch(
          ctx.token,
          `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date BETWEEN '${ctx.startDate}' AND '${ctx.endDate}' ORDER BY segments.date`,
          customerId
        ),
        fetchAdsCampaigns(ctx.token, customerId, {
          startDate: addDays(ctx.endDate, -(TABLE_WINDOW_DAYS - 1)),
          endDate: ctx.endDate,
        }),
      ])
      const account = accountRows[0]?.customer
      const accountName = String(account?.descriptiveName || customerId)
      const currency = String(account?.currencyCode || "USD")
      const adsDaily: AdsDailyRow[] = dailyRows.map((row) => ({
        date: String(row.segments?.date || ""),
        adImpressions: num(row.metrics?.impressions),
        adClicks: num(row.metrics?.clicks),
        adSpend: microsToAmount(row.metrics?.costMicros),
        adConversions: num(row.metrics?.conversions),
      }))
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: true,
          detail: `Reading ${accountName} (${customerId})`,
        },
        adsDaily,
        ads: {
          ok: true,
          error: null,
          customerId,
          accountName,
          currency,
          campaigns,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google Ads API failed"
      return {
        health: { id: this.id, label: this.label, ok: false, detail: message },
        ads: { ...emptyAds(customerId), error: message },
      }
    }
  },
}

const vercelSource: InsightSource = {
  id: "vercel",
  label: "Vercel Analytics",
  appliesTo: (site) => Boolean(site.vercelProjectId),
  async run(site, ctx) {
    const projectId = site.vercelProjectId
    if (!vercelConfigured()) {
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: false,
          detail: "Add a VERCEL_TOKEN (and VERCEL_TEAM_ID for team projects) to read Web Analytics.",
        },
        vercel: {
          ...emptyVercel(projectId),
          error: "VERCEL_TOKEN is not set.",
        },
      }
    }
    try {
      const tables = await fetchVercelAnalytics(projectId, ctx.endDate)
      const pageviews = tables.daily.reduce((sum, row) => sum + row.pageviews, 0)
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: true,
          detail: `${pageviews.toLocaleString("en-US")} pageviews in the last ${tables.daily.length || 30} days from Vercel. Older days stay in this snapshot so Hobby's 30-day window does not erase them.`,
        },
        vercel: {
          ok: true,
          error: null,
          projectId,
          pages: tables.pages,
          referrers: tables.referrers,
          devices: tables.devices,
          countries: tables.countries,
        },
        vercelDaily: tables.daily,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Vercel Analytics API failed"
      return {
        health: {
          id: this.id,
          label: this.label,
          ok: false,
          detail: message,
        },
        vercel: { ...emptyVercel(projectId), error: message },
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
  adsSource,
  vercelSource,
  collectorSource,
  mpSource,
  uptimeSource,
]
