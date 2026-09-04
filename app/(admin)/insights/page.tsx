import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { getDefaultSiteSlug } from "@/lib/insights/queries"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Insights" }
export const dynamic = "force-dynamic"

/** The hub opens on the house property (tallkarol.com). */
export default async function InsightsIndexPage() {
  const slug = await getDefaultSiteSlug()
  if (slug) redirect(`/insights/${slug}`)

  return (
    <>
      <PageHeader title="Insights" />
      <Card surface="well" className="mt-10 border-dashed px-6 py-10 text-center">
        <p className="text-sm font-semibold text-tk-onyx">No properties yet</p>
        <p className="mt-1 text-sm text-ink-3">
          Add one with <code>npm run site:add</code>, then grant the service
          account and refresh.
        </p>
      </Card>
    </>
  )
}
