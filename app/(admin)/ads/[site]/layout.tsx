import Link from "next/link"
import { notFound } from "next/navigation"
import { ClientRail } from "@/components/insights/ClientRail"
import { RefreshInsights } from "@/components/insights/RefreshInsights"
import { adsCampaignSplitFor, adsSplitNote } from "@/lib/insights/ads-split"
import { fmtCustomerId } from "@/lib/insights/derive"
import { getAdsSites, getInsightsContext } from "@/lib/insights/queries"
import { ROUTES } from "@/lib/nav"

export const dynamic = "force-dynamic"

export default async function PaidAdsSiteLayout({
  params,
  children,
}: {
  params: { site: string }
  children: React.ReactNode
}) {
  const [adsSites, ctx] = await Promise.all([
    getAdsSites(),
    getInsightsContext(params.site),
  ])
  if (!ctx || !ctx.site.adsCustomerId) notFound()
  const { site, refreshedAt } = ctx
  const account = ctx.snapshot?.ads.accountName || site.name
  const splitNote = adsSplitNote(adsCampaignSplitFor(site))

  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
        Paid Ads / <span className="text-tk-onyx">{site.client?.name ?? site.name}</span>
      </p>

      <ClientRail
        sites={adsSites}
        activeSlug={site.slug}
        hrefFor={(slug) => `${ROUTES.paidAds}/${slug}`}
        showAdd={false}
      />

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tk-onyx">
            {account}
          </h1>
          <p className="mt-1 font-mono text-xs text-tk-slate/55">
            {fmtCustomerId(site.adsCustomerId)}
            {ctx.snapshot?.ads.currency ? ` · ${ctx.snapshot.ads.currency}` : ""}
            {splitNote ? ` · ${splitNote}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshInsights slug={site.slug} refreshedAt={refreshedAt} />
          <Link
            href={`${ROUTES.insights}/${site.slug}`}
            className="rounded-lg border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-onyx hover:border-tk-teal hover:text-tk-teal"
          >
            Analytics →
          </Link>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </>
  )
}
