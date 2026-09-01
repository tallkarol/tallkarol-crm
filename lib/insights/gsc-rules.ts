import type { ScanResult, SitemapRow, UrlRow } from "@/lib/insights/gsc-index"

/**
 * Rules turn a scan into findings. Each one names a problem somebody can act
 * on, and nothing else — a scan that reports "63 URLs, here they are" is a
 * report; a scan that reports "these 4 need work" is a ticket.
 *
 * Every rule produces a stable `key`, which is what makes the same broken page
 * one finding seen twice rather than two findings. That is the whole mechanism
 * behind "what did we fix this month".
 */

export type Finding = {
  key: string
  rule: string
  url: string
  /** 1 blocking · 2 should fix · 3 watch. Mirrors tasks.priority. */
  severity: 1 | 2 | 3
  detail: string
}

/** Not crawled in this long is worth mentioning, never worth a ticket. */
const STALE_CRAWL_DAYS = 60

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

function short(url: string): string {
  try {
    return new URL(url).pathname || url
  } catch {
    return url
  }
}

function urlRules(row: UrlRow): Finding[] {
  const out: Finding[] = []
  const path = short(row.url)

  if (row.verdict === "SCAN_ERROR") {
    out.push({
      key: `scan.error:${row.url}`,
      rule: "scan.error",
      url: row.url,
      severity: 3,
      detail: `Inspection failed for ${path} — ${row.error ?? "unknown error"}. Could not tell, which is not the same as fine.`,
    })
    return out
  }

  // One rule for "in the sitemap, not in the index", NOT one per coverage
  // string. Google returns different states for the same page between calls —
  // a URL sat in limbo answers "unknown to Google" on one scan and "Discovered
  // - currently not indexed" on the next. Keying on the string made a page
  // flap between resolved and reopened on back-to-back scans, which would put
  // phantom fixes in the billing record. The state goes in `detail`, where it
  // can change without inventing work.
  const notIndexed =
    row.coverageState === "URL is unknown to Google" ||
    Boolean(row.coverageState?.startsWith("Discovered")) ||
    Boolean(row.coverageState?.startsWith("Crawled - currently not indexed"))
  if (notIndexed) {
    const neverCrawled = !row.lastCrawlTime
    out.push({
      key: `coverage.not-indexed:${row.url}`,
      rule: "coverage.not-indexed",
      url: row.url,
      severity: neverCrawled ? 1 : 2,
      detail: neverCrawled
        ? `${path} is in the sitemap and Google has never crawled it — a discoverability problem, not a quality one. Google reports: "${row.coverageState}".`
        : `${path} is known but not indexed. Either make it worth indexing or take it out of the sitemap — leaving it does neither. Google reports: "${row.coverageState}".`,
    })
  }

  if (row.canonicalMismatch) {
    out.push({
      key: `canonical.mismatch:${row.url}`,
      rule: "canonical.mismatch",
      url: row.url,
      severity: 1,
      detail: `${path} declares ${row.userCanonical} but Google chose ${row.googleCanonical}. Google is indexing a different URL than the one intended.`,
    })
  }

  if (row.pageFetchState && !["SUCCESSFUL", "PAGE_FETCH_STATE_UNSPECIFIED"].includes(row.pageFetchState)) {
    out.push({
      key: `fetch.failed:${row.url}`,
      rule: "fetch.failed",
      url: row.url,
      severity: 1,
      detail: `${path} could not be fetched: ${row.pageFetchState}. A serving problem, not an SEO one.`,
    })
  }

  if (row.robotsTxtState === "DISALLOWED") {
    out.push({
      key: `robots.blocked:${row.url}`,
      rule: "robots.blocked",
      url: row.url,
      severity: 1,
      detail: `${path} is in the sitemap and blocked by robots.txt. One of the two is wrong.`,
    })
  }

  const age = daysSince(row.lastCrawlTime)
  if (age !== null && age > STALE_CRAWL_DAYS) {
    out.push({
      key: `crawl.stale:${row.url}`,
      rule: "crawl.stale",
      url: row.url,
      severity: 3,
      detail: `${path} was last crawled ${age} days ago. Watch only — Google recrawls on its own schedule.`,
    })
  }

  return out
}

function sitemapRules(sitemaps: SitemapRow[]): Finding[] {
  return sitemaps.flatMap((m) => {
    if (m.errors === 0 && m.warnings === 0) return []
    return [
      {
        key: `sitemap.errors:${m.path}`,
        rule: "sitemap.errors",
        url: m.path,
        severity: m.errors > 0 ? 1 : 2,
        detail: `${m.path}: ${m.errors} error(s), ${m.warnings} warning(s) reported by Search Console.`,
      } as Finding,
    ]
  })
}

export function findingsFrom(scan: ScanResult): Finding[] {
  const found = [...scan.urls.flatMap(urlRules), ...sitemapRules(scan.sitemaps)]
  // Blocking first — the list is read top-down and acted on in order.
  return found.sort((a, b) => a.severity - b.severity || a.key.localeCompare(b.key))
}

export const RULE_LABELS: Record<string, string> = {
  "coverage.not-indexed": "Not indexed",
  "canonical.mismatch": "Canonical mismatch",
  "fetch.failed": "Fetch failed",
  "robots.blocked": "Blocked by robots",
  "sitemap.errors": "Sitemap errors",
  "crawl.stale": "Stale crawl",
  "scan.error": "Scan error",
}

/** Severity 3 is context, not work. Only 1 and 2 become a ticket. */
export function isTicketable(f: { severity: number }) {
  return f.severity <= 2
}
