import Link from "next/link"
import { notFound } from "next/navigation"
import { BarList, MeterList } from "@/components/insights/BarList"
import { Card } from "@/components/insights/Card"
import { EmptySnapshot } from "@/components/insights/EmptySnapshot"
import { HealthPills } from "@/components/insights/HealthPills"
import { Delta, KpiTile, PositionKpiDelta } from "@/components/insights/KpiTile"
import { LoopStrip } from "@/components/insights/LoopStrip"
import { RangeSwitcher } from "@/components/insights/RangeSwitcher"
import { SearchMultiples } from "@/components/insights/SearchMultiples"
import { SearchTable } from "@/components/insights/SearchTable"
import { TrendChart } from "@/components/insights/TrendChart"
import { isHouseSite, loadCrmSlice, windowDates } from "@/lib/insights/crm"
import {
  deltaPct,
  deriveWindow,
  fmtConv,
  fmtInt,
  fmtMoney,
  parseRange,
} from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"
import { TABLE_WINDOW_DAYS, type CrmSlice } from "@/lib/insights/types"
import type { TrendMetric } from "@/lib/insights/chart"

export const metadata = { title: "Insights" }
export const dynamic = "force-dynamic"

export default async function InsightsOverviewPage({
  params,
  searchParams,
}: {
  params: { site: string }
  searchParams: { range?: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx) notFound()
  const { site, snapshot } = ctx

  if (!snapshot) {
    return <EmptySnapshot slug={site.slug} siteName={site.name} />
  }

  const range = parseRange(searchParams.range)
  const win = deriveWindow(snapshot, range)
  const { totals, previousTotals: prev } = win
  const hasGa4 = snapshot.ga4.ok
  const hasGsc = snapshot.gsc.ok
  const ads = snapshot.ads
  const hasAds = Boolean(ads?.ok)
  const currency = ads?.currency || "USD"

  const metrics: TrendMetric[] = [
    ...(hasGa4 ? (["users", "sessions", "keyEvents"] as const) : []),
    ...(hasGsc ? (["clicks", "impressions"] as const) : []),
    ...(hasAds ? (["adSpend", "adClicks", "adImpressions"] as const) : []),
  ]
  const initialMetric: TrendMetric = hasGa4 ? "sessions" : hasAds ? "adSpend" : "clicks"

  let crm: CrmSlice | null = null
  const house = isHouseSite(site)
  if (house && win.current.length > 0) {
    const { start, end } = windowDates(
      win.current[0].date,
      win.current[win.current.length - 1].date
    )
    crm = await loadCrmSlice(start, end)
  }

  const spark = (
    key: "users" | "sessions" | "keyEvents" | "clicks" | "impressions" | "adSpend" | "adClicks" | "adImpressions"
  ) => win.current.map((p) => p[key] ?? 0)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-tk-slate/60">
          {win.label} · vs. previous {prev ? `${range} days` : "window (not covered)"}
        </p>
        <RangeSwitcher />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Users"
          value={fmtInt(hasGa4 ? totals.users : null)}
          delta={<Delta pct={hasGa4 ? deltaPct(totals.users, prev?.users) : null} />}
          spark={hasGa4 ? spark("users") : undefined}
        />
        <KpiTile
          label="Sessions"
          value={fmtInt(hasGa4 ? totals.sessions : null)}
          delta={<Delta pct={hasGa4 ? deltaPct(totals.sessions, prev?.sessions) : null} />}
          spark={hasGa4 ? spark("sessions") : undefined}
        />
        <KpiTile
          label="Key events"
          value={fmtInt(hasGa4 ? totals.keyEvents : null)}
          delta={
            <Delta abs={hasGa4 && prev ? totals.keyEvents - prev.keyEvents : null} />
          }
          spark={hasGa4 ? spark("keyEvents") : undefined}
        />
        <KpiTile
          label="Search clicks"
          value={fmtInt(hasGsc ? totals.clicks : null)}
          delta={<Delta pct={hasGsc ? deltaPct(totals.clicks, prev?.clicks) : null} />}
          spark={hasGsc ? spark("clicks") : undefined}
          series="amber"
        />
        <KpiTile
          label="Impressions"
          value={fmtInt(hasGsc ? totals.impressions : null)}
          delta={
            <Delta pct={hasGsc ? deltaPct(totals.impressions, prev?.impressions) : null} />
          }
          spark={hasGsc ? spark("impressions") : undefined}
          series="amber"
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
          footnote="lower is better"
        />
      </div>

      {hasAds ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Ad spend"
            value={fmtMoney(totals.adSpend, currency)}
            delta={<Delta pct={deltaPct(totals.adSpend, prev?.adSpend)} goodWhenUp={false} />}
            spark={spark("adSpend")}
          />
          <KpiTile
            label="Ad clicks"
            value={fmtInt(totals.adClicks)}
            delta={<Delta pct={deltaPct(totals.adClicks, prev?.adClicks)} />}
            spark={spark("adClicks")}
          />
          <KpiTile
            label="Ad impressions"
            value={fmtInt(totals.adImpressions)}
            delta={<Delta pct={deltaPct(totals.adImpressions, prev?.adImpressions)} />}
            spark={spark("adImpressions")}
          />
          <KpiTile
            label="Ad conversions"
            value={fmtConv(totals.adConversions)}
            delta={
              <Delta abs={prev ? totals.adConversions - prev.adConversions : null} />
            }
          />
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card
          title={`${metrics.length > 0 ? "Daily trend" : "Trend"}`}
          note="previous window dashed"
          className="xl:col-span-8"
        >
          {metrics.length > 0 ? (
            <TrendChart
              current={win.current}
              previous={win.previous}
              metrics={metrics}
              initialMetric={initialMetric}
            />
          ) : (
            <p className="px-5 py-8 text-sm text-tk-slate/70">
              No connected source returns daily data yet — see Health.
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-3 xl:col-span-4">
          {house && crm ? (
            <Card title="Closing the loop" note="GA4 ↔ CRM">
              <LoopStrip sessions={totals.sessions} keyEvents={totals.keyEvents} crm={crm} />
            </Card>
          ) : null}
          <Card title="Devices" note={`${TABLE_WINDOW_DAYS}d sessions`}>
            {hasGa4 ? (
              <MeterList rows={snapshot.ga4.devices} />
            ) : (
              <p className="px-5 py-5 text-sm text-tk-slate/70">
                GA4 is not connected for this property.
              </p>
            )}
          </Card>
          <Card
            title="Source health"
            right={
              <Link
                href={`/insights/${site.slug}/health`}
                className="text-[11px] font-semibold text-tk-teal hover:underline"
              >
                Health tab →
              </Link>
            }
          >
            <HealthPills health={snapshot.health} />
          </Card>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card title="Channels" note={`${TABLE_WINDOW_DAYS}d sessions`} className="xl:col-span-5">
          {hasGa4 ? (
            <BarList rows={snapshot.ga4.channels.slice(0, 6)} />
          ) : (
            <p className="px-5 py-5 text-sm text-tk-slate/70">GA4 is not connected.</p>
          )}
        </Card>
        <Card
          title="Top pages"
          right={
            <Link
              href={`/insights/${site.slug}/traffic${range !== 28 ? `?range=${range}` : ""}`}
              className="text-[11px] font-semibold text-tk-teal hover:underline"
            >
              Full list in Traffic →
            </Link>
          }
          className="xl:col-span-7"
        >
          {hasGa4 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-tk-slate/12 text-left text-[10px] font-bold uppercase tracking-wide text-tk-slate/55">
                    <th className="px-5 py-2 font-bold">Page</th>
                    <th className="px-3 py-2 text-right font-bold">Sessions</th>
                    <th className="px-5 py-2 text-right font-bold">Key events</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.ga4.pages.slice(0, 6).map((row) => (
                    <tr key={row.name} className="border-b border-tk-slate/[.06] last:border-0">
                      <td className="max-w-[22rem] truncate px-5 py-2 font-medium text-tk-onyx" title={row.name}>
                        {row.name}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                        {fmtInt(row.sessions)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-tk-onyx">
                        {fmtInt(row.keyEvents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-5 text-sm text-tk-slate/70">GA4 is not connected.</p>
          )}
        </Card>
      </div>

      <Card
        title="Search performance"
        right={
          <Link
            href={`/insights/${site.slug}/search${range !== 28 ? `?range=${range}` : ""}`}
            className="text-[11px] font-semibold text-tk-teal hover:underline"
          >
            Top 25 in Search →
          </Link>
        }
        className="mt-3"
      >
        {hasGsc ? (
          <>
            <SearchMultiples points={win.current} />
            <SearchTable rows={snapshot.gsc.queries} nameHeader="Query" limit={5} />
            <p className="border-t border-tk-slate/[.06] px-5 py-2.5 text-[11px] text-tk-slate/55">
              Queries cover the last {TABLE_WINDOW_DAYS} days; Δ pos compares the{" "}
              {TABLE_WINDOW_DAYS} days before that. Search Console data lags ~2 days.
            </p>
          </>
        ) : (
          <p className="px-5 py-5 text-sm text-tk-slate/70">
            Search Console is not connected — see Health.
          </p>
        )}
      </Card>

      {hasAds ? (
        <Card
          title="Campaigns"
          note={`${TABLE_WINDOW_DAYS}d · ${ads.accountName}`}
          right={
            <Link
              href={`/api/insights/export?site=${site.slug}&table=campaigns`}
              className="text-[11px] font-semibold text-tk-teal hover:underline"
            >
              CSV
            </Link>
          }
          className="mt-3"
        >
          {ads.campaigns.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-tk-slate/12 text-left text-[10px] font-bold uppercase tracking-wide text-tk-slate/55">
                    <th className="px-5 py-2 font-bold">Campaign</th>
                    <th className="px-3 py-2 text-right font-bold">Spend</th>
                    <th className="px-3 py-2 text-right font-bold">Clicks</th>
                    <th className="px-3 py-2 text-right font-bold">Impr.</th>
                    <th className="px-5 py-2 text-right font-bold">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.campaigns.map((row) => (
                    <tr key={row.id || row.name} className="border-b border-tk-slate/[.06] last:border-0">
                      <td className="max-w-[22rem] truncate px-5 py-2 font-medium text-tk-onyx" title={row.name}>
                        {row.name}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                        {fmtMoney(row.spend, currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                        {fmtInt(row.clicks)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                        {fmtInt(row.impressions)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-tk-onyx">
                        {fmtConv(row.conversions)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-5 text-sm text-tk-slate/70">
              No impressions in this window.
            </p>
          )}
        </Card>
      ) : null}
    </>
  )
}
