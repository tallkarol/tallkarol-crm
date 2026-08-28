import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { getDefaultSiteSlug } from "@/lib/insights/queries"

export const metadata = { title: "Insights" }
export const dynamic = "force-dynamic"

/** The hub opens on the house property (tallkarol.com). */
export default async function InsightsIndexPage() {
  const slug = await getDefaultSiteSlug()
  if (slug) redirect(`/insights/${slug}`)

  return (
    <>
      <PageHeader title="Insights" />
      <div className="mt-10 rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-10 text-center shadow-sm">
        <p className="text-sm font-semibold text-tk-onyx">No properties yet</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          Add one with <code>npm run site:add</code>, then grant the service
          account and refresh.
        </p>
      </div>
    </>
  )
}
