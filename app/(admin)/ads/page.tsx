import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { getDefaultAdsSiteSlug } from "@/lib/insights/queries"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Paid Ads" }
export const dynamic = "force-dynamic"

/** Opens the first property that has a Google Ads account attached. */
export default async function PaidAdsIndexPage() {
  const slug = await getDefaultAdsSiteSlug()
  if (slug) redirect(`/ads/${slug}`)

  return (
    <>
      <PageHeader title="Paid Ads" />
      <Card surface="well" className="mt-10 border-dashed px-6 py-10 text-center">
        <p className="text-sm font-semibold text-tk-onyx">No Ads accounts yet</p>
        <p className="mt-1 text-sm text-ink-3">
          Attach a customer id with <code>npm run site:set -- &lt;slug&gt; adsCustomerId &lt;id&gt;</code>,
          then refresh the snapshot from Analytics.
        </p>
      </Card>
    </>
  )
}
