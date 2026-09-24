import { PortalInsights } from "@/components/portal/insights-panels"
import { getPortalScope } from "@/lib/portal"

export const metadata = { title: "Insights · TALLKAROL Portal" }

export default async function PortalInsightsPage(
  props: {
    searchParams: Promise<{ site?: string; range?: string }>
  }
) {
  const searchParams = await props.searchParams
  const scope = (await getPortalScope())!
  return (
    <>
      <h1 className="font-['Inter_Tight',sans-serif] text-[22px] font-bold tracking-tight text-tk-onyx">
        Insights
      </h1>
      <p className="mt-0.5 text-[13px] text-tk-slate/60">
        Traffic, search, ads, and site health — live from Google Analytics, Search
        Console, Google Ads, and PageSpeed.
      </p>
      <PortalInsights
        clients={scope.clients}
        siteParam={searchParams.site}
        rangeParam={searchParams.range}
      />
    </>
  )
}
