import { googleAccessToken } from "@/lib/google-auth"

/**
 * URL Inspection — the only API that answers the question Index Coverage asks.
 *
 * There is no API for the Coverage report itself. What exists is one inspection
 * per URL, which returns the same verdicts Coverage aggregates. So a scan is
 * `sitemap.xml` → N inspections → one sitemaps call.
 *
 * Inspection is SLOW: about 6.8 seconds per URL, measured, not the sub-second
 * most Google APIs answer in. Serially, 63 URLs is seven minutes. The quota is
 * 2,000/day and 600/minute, so the limit is latency rather than rate — hence a
 * small concurrency window, which brings the same scan under ninety seconds
 * while still using a fraction of a minute's allowance.
 *
 * Either way it is far too slow for a page load, which is why nothing here runs
 * from a component.
 */

const INSPECT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
const SITEMAPS = "https://searchconsole.googleapis.com/webmasters/v3/sites"
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]

/**
 * Inspections in flight at once. Google allows 600/minute; at ~6.8s each, eight
 * concurrent is roughly 70/minute — well inside the rate limit, and the run
 * finishes in about a minute and a half instead of seven.
 */
const CONCURRENCY = 8

export type UrlRow = {
  url: string
  verdict: string
  coverageState: string | null
  indexingState: string | null
  robotsTxtState: string | null
  pageFetchState: string | null
  lastCrawlTime: string | null
  googleCanonical: string | null
  userCanonical: string | null
  canonicalMismatch: boolean
  inSitemap: boolean
  richResults: string[]
  error?: string
}

export type SitemapRow = {
  path: string
  lastDownloaded: string | null
  errors: number
  warnings: number
  submitted: number
  isPending: boolean
}

export type ScanResult = {
  siteUrl: string
  scannedAt: string
  urls: UrlRow[]
  sitemaps: SitemapRow[]
}

async function authorized(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Search Console ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return res.json()
}

async function sitemapUrls(origin: string): Promise<string[]> {
  const res = await fetch(`${origin}/sitemap.xml`)
  if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`)
  const xml = await res.text()
  return Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g)).map((m) => m[1].trim())
}

/**
 * Google omits fields rather than nulling them, so every absent value would
 * otherwise read as a change on the next scan. Normalising here is what makes
 * two scans diffable.
 */
function normalise(url: string, result: Record<string, any> | undefined): UrlRow {
  const idx = result?.indexStatusResult ?? {}
  const google = idx.googleCanonical ?? null
  const user = idx.userCanonical ?? null
  return {
    url,
    verdict: idx.verdict ?? "UNKNOWN",
    coverageState: idx.coverageState ?? null,
    indexingState: idx.indexingState ?? null,
    robotsTxtState: idx.robotsTxtState ?? null,
    pageFetchState: idx.pageFetchState ?? null,
    lastCrawlTime: idx.lastCrawlTime ?? null,
    googleCanonical: google,
    userCanonical: user,
    canonicalMismatch: Boolean(google && user && google !== user),
    inSitemap: (idx.sitemap ?? []).length > 0,
    richResults: (result?.richResultsResult?.detectedItems ?? []).map(
      (d: { richResultType?: string }) => d.richResultType ?? "unknown"
    ),
  }
}

export async function scanSite(params: {
  siteUrl: string
  origin: string
}): Promise<ScanResult> {
  const token = await googleAccessToken(SCOPES)
  const urls = await sitemapUrls(params.origin)

  // Results are written back by index so the order matches the sitemap however
  // the workers interleave — a scan that reorders its own rows would diff
  // against the last one as though every page had changed.
  const rows: UrlRow[] = new Array(urls.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= urls.length) return
      const url = urls[i]
      try {
        const body = JSON.stringify({
          inspectionUrl: url,
          siteUrl: params.siteUrl,
          languageCode: "en-US",
        })
        const res = await authorized(token, INSPECT, { method: "POST", body })
        rows[i] = normalise(url, res.inspectionResult)
      } catch (err) {
        // One URL failing must not lose the other 62. A scan error is itself a
        // finding — it means we could not tell, which is different from "fine".
        rows[i] = {
          ...normalise(url, undefined),
          verdict: "SCAN_ERROR",
          error: err instanceof Error ? err.message : "inspection failed",
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker())
  )

  let sitemaps: SitemapRow[] = []
  try {
    const res = await authorized(
      token,
      `${SITEMAPS}/${encodeURIComponent(params.siteUrl)}/sitemaps`
    )
    sitemaps = (res.sitemap ?? []).map((m: Record<string, any>) => ({
      path: m.path ?? "",
      lastDownloaded: m.lastDownloaded ?? null,
      errors: Number(m.errors ?? 0),
      warnings: Number(m.warnings ?? 0),
      submitted: (m.contents ?? []).reduce(
        (n: number, c: { submitted?: string }) => n + Number(c.submitted ?? 0),
        0
      ),
      isPending: Boolean(m.isPending),
    }))
  } catch {
    // A missing sitemaps response is not worth failing 63 inspections over.
    sitemaps = []
  }

  return {
    siteUrl: params.siteUrl,
    scannedAt: new Date().toISOString(),
    urls: rows,
    sitemaps,
  }
}
