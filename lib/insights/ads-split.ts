import type { SnapshotV2 } from "@/lib/insights/types"

/**
 * Mineralife and Zemvelo share one Google Ads account. Campaigns with B2B
 * in the name are Mineralife; everything else in that account is Zemvelo.
 * Other sites keep the whole account.
 */
export type AdsCampaignSplit = "b2b" | "not-b2b" | null

type SplitSite = { slug: string; client?: { slug: string } | null }

const MINERALIFE = new Set(["mineralife", "mycustommanufacturer"])
const ZEMVELO = new Set(["zemvelo"])

export function adsCampaignSplitFor(site: SplitSite): AdsCampaignSplit {
  const keys = [site.slug, site.client?.slug].filter(Boolean) as string[]
  if (keys.some((key) => MINERALIFE.has(key))) return "b2b"
  if (keys.some((key) => ZEMVELO.has(key))) return "not-b2b"
  return null
}

export function campaignMatchesSplit(name: string, split: AdsCampaignSplit) {
  if (split == null) return true
  const b2b = /b2b/i.test(name)
  return split === "b2b" ? b2b : !b2b
}

export function adsSplitNote(split: AdsCampaignSplit) {
  if (split === "b2b") return "B2B campaigns · Mineralife"
  if (split === "not-b2b") return "non-B2B campaigns · Zemvelo"
  return null
}

/** Campaign table on a cached snapshot — daily series needs a Refresh. */
export function scopeAdsSnapshot(snapshot: SnapshotV2, site: SplitSite): SnapshotV2 {
  const split = adsCampaignSplitFor(site)
  if (split == null || !snapshot.ads?.campaigns.length) return snapshot
  return {
    ...snapshot,
    ads: {
      ...snapshot.ads,
      campaigns: snapshot.ads.campaigns.filter((row) =>
        campaignMatchesSplit(row.name, split)
      ),
    },
  }
}
