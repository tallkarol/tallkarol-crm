/**
 * Sites whose public origin honors `?internal=1` (staff cookie; skip GTM / pixels).
 * Add a slug here when that site ships the same exclusion as mineralife-frontend.
 */
const INTERNAL_TRAFFIC_SLUGS = new Set(["mycustommanufacturer"])

export function siteSupportsInternalTraffic(site: {
  slug: string
  origin: string
}) {
  return Boolean(site.origin.trim()) && INTERNAL_TRAFFIC_SLUGS.has(site.slug)
}

export function excludeTrackingUrl(origin: string): string | null {
  const trimmed = origin.trim().replace(/\/$/, "")
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    url.searchParams.set("internal", "1")
    return url.toString()
  } catch {
    return null
  }
}
