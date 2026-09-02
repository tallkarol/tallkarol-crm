import type { PageSpeedScores } from "@/lib/insights/types"

/**
 * PageSpeed Insights v5 — a live Lighthouse run per call, so it only ever
 * runs from the explicit Refresh action, never on a page render. Needs
 * PAGESPEED_API_KEY: the keyless pool is a shared anonymous project whose
 * daily quota is permanently exhausted (verified 2 Sep 2026), and the API
 * takes keys only — the service account's OAuth token is rejected.
 * Each run takes 15–30 seconds, hence the generous abort timeout.
 */

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
const PSI_TIMEOUT_MS = 60_000

type PsiResponse = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>
  }
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>
  }
  error?: { message?: string }
}

function categoryScore(psi: PsiResponse, id: string): number | null {
  const score = psi.lighthouseResult?.categories?.[id]?.score
  return typeof score === "number" ? Math.round(score * 100) : null
}

function fieldMetric(psi: PsiResponse, id: string): number | null {
  const value = psi.loadingExperience?.metrics?.[id]?.percentile
  return typeof value === "number" ? value : null
}

export async function fetchPageSpeed(
  url: string,
  strategy: "mobile" | "desktop"
): Promise<PageSpeedScores> {
  const params = new URLSearchParams({ url, strategy })
  for (const category of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) {
    params.append("category", category)
  }
  const key = process.env.PAGESPEED_API_KEY
  if (key) params.set("key", key)

  const response = await fetch(`${PSI_ENDPOINT}?${params}`, {
    signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
    cache: "no-store",
  })
  const psi = (await response.json().catch(() => ({}))) as PsiResponse
  if (!response.ok) {
    throw new Error(psi.error?.message || `PageSpeed API returned ${response.status}.`)
  }

  const clsRaw = fieldMetric(psi, "CUMULATIVE_LAYOUT_SHIFT_SCORE")
  return {
    performance: categoryScore(psi, "performance"),
    accessibility: categoryScore(psi, "accessibility"),
    bestPractices: categoryScore(psi, "best-practices"),
    seo: categoryScore(psi, "seo"),
    lcpMs: fieldMetric(psi, "LARGEST_CONTENTFUL_PAINT_MS"),
    inpMs: fieldMetric(psi, "INTERACTION_TO_NEXT_PAINT"),
    /** CrUX reports CLS ×100 as an integer percentile. */
    cls: clsRaw == null ? null : clsRaw / 100,
  }
}
