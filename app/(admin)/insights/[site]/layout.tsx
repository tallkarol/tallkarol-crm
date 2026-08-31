import Link from "next/link"
import { notFound } from "next/navigation"
import { ClientRail } from "@/components/insights/ClientRail"
import { InsightsTabs } from "@/components/insights/InsightsTabs"
import { RefreshInsights } from "@/components/insights/RefreshInsights"
import { isHouseSite } from "@/lib/insights/crm"
import { getAllSites, getInsightsContext } from "@/lib/insights/queries"
import { fmtInt } from "@/lib/insights/derive"

export const dynamic = "force-dynamic"

export default async function InsightsSiteLayout({
  params,
  children,
}: {
  params: { site: string }
  children: React.ReactNode
}) {
  const [all, ctx] = await Promise.all([
    getAllSites(),
    getInsightsContext(params.site),
  ])
  if (!ctx) notFound()
  const { site, snapshot, refreshedAt } = ctx

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
          Insights / <span className="text-tk-onyx">{site.name}</span>
        </p>
        {snapshot?.ga4.ok ? (
          <p className="flex items-center gap-1.5 rounded-full border border-tk-slate/15 bg-white px-2.5 py-1 text-[11px] font-semibold text-tk-slate">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009688] motion-safe:animate-pulse" aria-hidden />
            {fmtInt(snapshot.ga4.realtimeUsers)} active · at last fetch
          </p>
        ) : null}
      </div>

      <ClientRail sites={all} activeSlug={site.slug} />

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-tk-onyx">
          {site.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshInsights slug={site.slug} refreshedAt={refreshedAt} />
          <Link
            href={`/insights/${site.slug}/reports`}
            className="rounded-lg bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90"
          >
            Snapshot report ↓
          </Link>
        </div>
      </div>

      <InsightsTabs
        slug={site.slug}
        isHouse={isHouseSite(site)}
        hasHost={Boolean(site.vercelProjectId)}
      />

      <div className="mt-5">{children}</div>
    </>
  )
}
