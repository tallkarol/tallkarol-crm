import { RefreshInsights } from "@/components/insights/RefreshInsights"

/** Rendered whenever a property has no v2 snapshot in the cache yet. */
export function EmptySnapshot({ slug, siteName }: { slug: string; siteName: string }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 text-center shadow-sm">
      <p className="text-sm font-semibold text-tk-onyx">
        Nothing fetched yet for {siteName}
      </p>
      <p className="mt-1 max-w-md text-sm text-tk-slate/70">
        The hub never calls Google on its own. Fetch once to pull 90 days of
        GA4 and Search Console data — every range and delta on these tabs is
        derived from that snapshot until you fetch again.
      </p>
      <div className="mt-5">
        <RefreshInsights slug={slug} refreshedAt={null} label="Fetch now" primary />
      </div>
    </div>
  )
}
