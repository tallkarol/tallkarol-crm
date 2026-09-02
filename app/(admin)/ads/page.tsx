import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { getDefaultAdsSiteSlug } from "@/lib/insights/queries"

export const metadata = { title: "Paid Ads" }
export const dynamic = "force-dynamic"

/** Opens the first property that has a Google Ads account attached. */
export default async function PaidAdsIndexPage() {
  const slug = await getDefaultAdsSiteSlug()
  if (slug) redirect(`/ads/${slug}`)

  return (
    <>
      <PageHeader title="Paid Ads" />
      <div className="mt-10 rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-10 text-center shadow-sm">
        <p className="text-sm font-semibold text-tk-onyx">No Ads accounts yet</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          Attach a customer id with <code>npm run site:set -- &lt;slug&gt; adsCustomerId &lt;id&gt;</code>,
          then refresh the snapshot from Analytics.
        </p>
      </div>
    </>
  )
}
