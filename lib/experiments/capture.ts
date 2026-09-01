import type { Site } from "@/db/schema"
import { googleAccessToken } from "@/lib/google-auth"
import { ga4Post, num } from "@/lib/insights/google"
import {
  EMPTY_FUNNEL,
  type FormLocationSpec,
  type FunnelCounts,
  type PageSpec,
  type ReadingPayload,
} from "@/lib/experiments/types"

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

/** The funnel events the hub already collects from the site's data layer. */
const FUNNEL_EVENTS = ["cta_click", "form_start", "form_submit", "generate_lead"]

const EVENT_FIELD: Record<string, keyof FunnelCounts> = {
  cta_click: "ctaClicks",
  form_start: "formStarts",
  form_submit: "formSubmits",
  generate_lead: "leads",
}

/**
 * `/contact` and `/contact/` are the same page to a human and two rows to GA4,
 * so every path is matched both ways and the counts are summed.
 */
function pathVariants(path: string): string[] {
  const bare = path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path
  return bare === "/" ? ["/"] : [bare, `${bare}/`]
}

function blank(): FunnelCounts {
  return { ...EMPTY_FUNNEL }
}

function add(into: FunnelCounts, field: keyof FunnelCounts, value: number) {
  into[field] += value
}

/**
 * One reading: per-page funnel counts, the same split by form location, and
 * sitewide totals.
 *
 * The hub's daily rollup cannot answer this — `DailyPoint` has no page-scoped
 * funnel metrics — so this queries GA4 directly for the window.
 */
export async function captureReading(params: {
  site: Site
  from: string
  to: string
  pages: PageSpec[]
  formLocations: FormLocationSpec[]
}): Promise<ReadingPayload> {
  const { site, from, to, pages, formLocations } = params
  if (!site.ga4PropertyId) {
    throw new Error(`${site.name} has no GA4 property id — nothing to read.`)
  }

  const token = await googleAccessToken([GA4_SCOPE])
  const dateRanges = [{ startDate: from, endDate: to }]
  const caveats: string[] = []

  // Which GA4 path belongs to which watched page.
  const pageByPath = new Map<string, string>()
  for (const page of pages) {
    for (const variant of pathVariants(page.path)) pageByPath.set(variant, page.key)
  }

  const result: ReadingPayload = {
    version: 1,
    pages: Object.fromEntries(pages.map((p) => [p.key, blank()])),
    formLocations: Object.fromEntries(formLocations.map((f) => [f.key, blank()])),
    sitewide: blank(),
    crmLeads: null,
    caveats,
  }

  // -- sessions and views per page
  const traffic = await ga4Post(token, site.ga4PropertyId, "runReport", {
    dateRanges,
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    limit: 500,
  })
  for (const row of traffic.rows ?? []) {
    const key = pageByPath.get(row.dimensionValues?.[0]?.value ?? "")
    if (!key) continue
    const page = result.pages[key]
    page.views += num(row.metricValues?.[0]?.value)
    page.sessions += num(row.metricValues?.[1]?.value)
  }

  // -- funnel events per page
  const funnel = await ga4Post(token, site.ga4PropertyId, "runReport", {
    dateRanges,
    dimensions: [{ name: "pagePath" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: { fieldName: "eventName", inListFilter: { values: FUNNEL_EVENTS } },
    },
    limit: 1000,
  })
  for (const row of funnel.rows ?? []) {
    const key = pageByPath.get(row.dimensionValues?.[0]?.value ?? "")
    const field = EVENT_FIELD[row.dimensionValues?.[1]?.value ?? ""]
    if (!key || !field) continue
    add(result.pages[key], field, num(row.metricValues?.[0]?.value))
  }

  // -- the same funnel split by form location
  if (formLocations.length) {
    try {
      const byLocation = await ga4Post(token, site.ga4PropertyId, "runReport", {
        dateRanges,
        dimensions: [{ name: "customEvent:form_location" }, { name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          filter: { fieldName: "eventName", inListFilter: { values: FUNNEL_EVENTS } },
        },
        limit: 200,
      })
      let sawAny = false
      for (const row of byLocation.rows ?? []) {
        const loc = row.dimensionValues?.[0]?.value ?? ""
        const field = EVENT_FIELD[row.dimensionValues?.[1]?.value ?? ""]
        if (!field || !result.formLocations[loc]) continue
        sawAny = true
        add(result.formLocations[loc], field, num(row.metricValues?.[0]?.value))
      }
      if (!sawAny) {
        caveats.push(
          "No form_location data in this window — the dimension only collects from the day it was registered."
        )
      }
    } catch {
      // A dimension registered after the window has no rows and GA4 rejects the
      // query outright. That is expected for the baseline, not a failure.
      caveats.push(
        "form_location was not collecting during this window, so the per-form split is unavailable."
      )
    }
  }

  // -- sitewide totals
  const sitewide = await ga4Post(token, site.ga4PropertyId, "runReport", {
    dateRanges,
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: { fieldName: "eventName", inListFilter: { values: FUNNEL_EVENTS } },
    },
    limit: 50,
  })
  for (const row of sitewide.rows ?? []) {
    const field = EVENT_FIELD[row.dimensionValues?.[0]?.value ?? ""]
    if (!field) continue
    add(result.sitewide, field, num(row.metricValues?.[0]?.value))
  }

  const sitewideTraffic = await ga4Post(token, site.ga4PropertyId, "runReport", {
    dateRanges,
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
  })
  const totals = sitewideTraffic.rows?.[0]?.metricValues
  result.sitewide.views = num(totals?.[0]?.value)
  result.sitewide.sessions = num(totals?.[1]?.value)

  caveats.push(
    "GA4 counts only visitors who accepted the cookie banner, so every figure here is a floor rather than a total."
  )

  return result
}
