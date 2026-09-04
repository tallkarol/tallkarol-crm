import { notFound } from "next/navigation"
import { Card } from "@/components/insights/Card"
import { CsvLink } from "@/components/insights/CsvLink"
import { EmptySnapshot } from "@/components/insights/EmptySnapshot"
import { Delta, KpiTile, PositionKpiDelta } from "@/components/insights/KpiTile"
import { RangeSwitcher } from "@/components/insights/RangeSwitcher"
import { SearchMultiples } from "@/components/insights/SearchMultiples"
import { SearchTable } from "@/components/insights/SearchTable"
import { deltaPct, deriveWindow, fmtInt, parseRange } from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"
import { TABLE_WINDOW_DAYS } from "@/lib/insights/types"

export const metadata = { title: "Search · Insights" }
export const dynamic = "force-dynamic"

export default async function InsightsSearchPage({
  params,
  searchParams,
}: {
  params: { site: string }
  searchParams: { range?: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx) notFound()
  const { site, snapshot } = ctx
  if (!snapshot) return <EmptySnapshot slug={site.slug} siteName={site.name} />

  if (!snapshot.gsc.ok) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-well px-6 py-10 text-center shadow-card">
        <p className="text-sm font-semibold text-tk-onyx">Search Console is not connected</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">
          {snapshot.gsc.error || "Grant the service account on this property, then refresh."}{" "}
          The Health tab has the exact steps.
        </p>
      </div>
    )
  }

  const range = parseRange(searchParams.range)
  const win = deriveWindow(snapshot, range)
  const { totals, previousTotals: prev } = win

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">
          {win.label} · Search Console lags ~2 days
        </p>
        <RangeSwitcher />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Clicks"
          value={fmtInt(totals.clicks)}
          delta={<Delta pct={deltaPct(totals.clicks, prev?.clicks)} />}
          spark={win.current.map((p) => p.clicks)}
          series="amber"
        />
        <KpiTile
          label="Impressions"
          value={fmtInt(totals.impressions)}
          delta={<Delta pct={deltaPct(totals.impressions, prev?.impressions)} />}
          spark={win.current.map((p) => p.impressions)}
          series="amber"
        />
        <KpiTile
          label="CTR"
          value={
            totals.impressions > 0
              ? `${((totals.clicks / totals.impressions) * 100).toFixed(1)}%`
              : "—"
          }
          delta={
            <Delta
              pct={
                prev && prev.impressions > 0 && totals.impressions > 0
                  ? deltaPct(
                      totals.clicks / totals.impressions,
                      prev.clicks / prev.impressions
                    )
                  : null
              }
            />
          }
        />
        <KpiTile
          label="Avg position"
          value={totals.avgPosition == null ? "—" : totals.avgPosition.toFixed(1)}
          delta={
            <PositionKpiDelta
              current={totals.avgPosition}
              previous={prev?.avgPosition ?? null}
            />
          }
          footnote="impressions-weighted · lower is better"
        />
      </div>

      <Card title="Daily search" className="mt-3">
        <SearchMultiples points={win.current} />
      </Card>

      <Card
        title={`Queries · top ${snapshot.gsc.queries.length}`}
        right={<CsvLink slug={site.slug} table="queries" />}
        className="mt-3"
      >
        <SearchTable rows={snapshot.gsc.queries} nameHeader="Query" />
        <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
          Fixed {TABLE_WINDOW_DAYS}-day window; Δ pos compares the {TABLE_WINDOW_DAYS} days
          before that. NEW = did not rank in the previous window.
        </p>
      </Card>

      <Card
        title={`Pages · top ${snapshot.gsc.pages.length}`}
        right={<CsvLink slug={site.slug} table="search-pages" />}
        className="mt-3"
      >
        <SearchTable rows={snapshot.gsc.pages} nameHeader="Page" />
      </Card>
    </>
  )
}
