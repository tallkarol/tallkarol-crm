import Link from "next/link"
import { notFound } from "next/navigation"
import { Card } from "@/components/insights/Card"
import { CsvLink } from "@/components/insights/CsvLink"
import { EmptySnapshot } from "@/components/insights/EmptySnapshot"
import { Delta, KpiTile } from "@/components/insights/KpiTile"
import { RangeSwitcher } from "@/components/insights/RangeSwitcher"
import { TrendChart } from "@/components/insights/TrendChart"
import {
  adsRates,
  deltaPct,
  deriveWindow,
  fmtConv,
  fmtInt,
  fmtMoney,
  fmtPct01,
  parseRange,
} from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"
import { TABLE_WINDOW_DAYS } from "@/lib/insights/types"
import type { TrendMetric } from "@/lib/insights/chart"
import { ROUTES } from "@/lib/nav"

export async function generateMetadata({ params }: { params: { site: string } }) {
  const ctx = await getInsightsContext(params.site)
  const name = ctx?.snapshot?.ads.accountName || ctx?.site.client?.name || ctx?.site.name
  return { title: name ? `Paid Ads · ${name}` : "Paid Ads" }
}

export const dynamic = "force-dynamic"

export default async function PaidAdsPage({
  params,
  searchParams,
}: {
  params: { site: string }
  searchParams: { range?: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx || !ctx.site.adsCustomerId) notFound()
  const { site, snapshot } = ctx

  if (!snapshot) {
    return <EmptySnapshot slug={site.slug} siteName={site.name} />
  }

  const range = parseRange(searchParams.range)
  const win = deriveWindow(snapshot, range)
  const { totals, previousTotals: prev } = win
  const ads = snapshot.ads
  const hasAds = Boolean(ads?.ok)
  const hasGa4 = snapshot.ga4.ok
  const currency = ads?.currency || "USD"
  const rates = adsRates(totals)
  const prevRates = prev ? adsRates(prev) : null
  const paidSeen = totals.ga4Paid > 0 ? totals.ga4Paid : totals.sessions
  const paidCapture =
    hasAds && totals.adClicks > 0 ? (paidSeen / totals.adClicks) * 100 : null

  const spark = (key: "adSpend" | "adClicks" | "adImpressions" | "adConversions") =>
    win.current.map((p) => p[key] ?? 0)

  const metrics: TrendMetric[] = ["adSpend", "adClicks", "adImpressions", "adConversions"]

  if (!hasAds) {
    return (
      <div className="rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-10 text-center shadow-sm">
        <p className="text-sm font-semibold text-tk-onyx">Ads did not load on the last fetch</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          {ads?.error || "Refresh the snapshot, or check the Health tab on Analytics."}
        </p>
        <Link
          href={`${ROUTES.insights}/${site.slug}/health`}
          className="mt-4 inline-block text-sm font-semibold text-tk-teal hover:underline"
        >
          Health →
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-tk-slate/60">
          {win.label} · vs. previous {prev ? `${range} days` : "window (not covered)"}
        </p>
        <RangeSwitcher />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Spend"
          value={fmtMoney(totals.adSpend, currency)}
          delta={<Delta pct={deltaPct(totals.adSpend, prev?.adSpend)} goodWhenUp={false} />}
          spark={spark("adSpend")}
          series="ink"
        />
        <KpiTile
          label="Clicks"
          value={fmtInt(totals.adClicks)}
          delta={<Delta pct={deltaPct(totals.adClicks, prev?.adClicks)} />}
          spark={spark("adClicks")}
          series="ink"
        />
        <KpiTile
          label="Impressions"
          value={fmtInt(totals.adImpressions)}
          delta={<Delta pct={deltaPct(totals.adImpressions, prev?.adImpressions)} />}
          spark={spark("adImpressions")}
          series="ink"
        />
        <KpiTile
          label="Conversions"
          value={fmtConv(totals.adConversions)}
          delta={
            <Delta abs={prev ? totals.adConversions - prev.adConversions : null} />
          }
          spark={spark("adConversions")}
          series="ink"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="CPC"
          value={rates.cpc == null ? "—" : fmtMoney(rates.cpc, currency)}
          delta={
            <Delta
              pct={rates.cpc == null ? null : deltaPct(rates.cpc, prevRates?.cpc)}
              goodWhenUp={false}
            />
          }
          footnote="spend ÷ clicks"
        />
        <KpiTile
          label="CTR"
          value={rates.ctr == null ? "—" : fmtPct01(rates.ctr)}
          delta={<Delta pct={rates.ctr == null ? null : deltaPct(rates.ctr, prevRates?.ctr)} />}
          footnote="clicks ÷ impressions"
        />
        <KpiTile
          label="CPA"
          value={rates.cpa == null ? "—" : fmtMoney(rates.cpa, currency)}
          delta={
            <Delta
              pct={rates.cpa == null ? null : deltaPct(rates.cpa, prevRates?.cpa)}
              goodWhenUp={false}
            />
          }
          footnote="spend ÷ conversions"
        />
        <KpiTile
          label="Conv. rate"
          value={rates.convRate == null ? "—" : fmtPct01(rates.convRate)}
          delta={
            <Delta
              pct={rates.convRate == null ? null : deltaPct(rates.convRate, prevRates?.convRate)}
            />
          }
          footnote="conversions ÷ clicks"
        />
      </div>

      <Card title="Daily trend" note="previous window dashed" className="mt-3">
        <TrendChart
          current={win.current}
          previous={win.previous}
          metrics={metrics}
          initialMetric="adSpend"
        />
      </Card>

      <Card
        title="Campaigns"
        note={`${TABLE_WINDOW_DAYS}d · ${ads.accountName}`}
        right={<CsvLink slug={site.slug} table="campaigns" />}
        className="mt-3"
      >
        {ads.campaigns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-tk-slate/12 text-left text-[10px] font-bold uppercase tracking-wide text-tk-slate/55">
                  <th className="px-5 py-2 font-bold">Campaign</th>
                  <th className="px-3 py-2 text-right font-bold">Spend</th>
                  <th className="px-3 py-2 text-right font-bold">Clicks</th>
                  <th className="px-3 py-2 text-right font-bold">Impr.</th>
                  <th className="px-3 py-2 text-right font-bold">CTR</th>
                  <th className="px-3 py-2 text-right font-bold">CPC</th>
                  <th className="px-3 py-2 text-right font-bold">Conv.</th>
                  <th className="px-5 py-2 text-right font-bold">CPA</th>
                </tr>
              </thead>
              <tbody>
                {ads.campaigns.map((row) => {
                  const rowRates = adsRates({
                    adSpend: row.spend,
                    adClicks: row.clicks,
                    adImpressions: row.impressions,
                    adConversions: row.conversions,
                  })
                  return (
                    <tr
                      key={row.id || row.name}
                      className="border-b border-tk-slate/[.06] last:border-0"
                    >
                      <td
                        className="max-w-[22rem] truncate px-5 py-2 font-medium text-tk-onyx"
                        title={row.name}
                      >
                        {row.name}
                        {row.status && row.status !== "ENABLED" ? (
                          <span className="ml-2 text-[10px] font-semibold uppercase text-tk-slate/50">
                            {row.status.toLowerCase()}
                          </span>
                        ) : null}
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
                      <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                        {rowRates.ctr == null ? "—" : fmtPct01(rowRates.ctr)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                        {rowRates.cpc == null ? "—" : fmtMoney(rowRates.cpc, currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                        {fmtConv(row.conversions)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-tk-onyx">
                        {rowRates.cpa == null ? "—" : fmtMoney(rowRates.cpa, currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-5 text-sm text-tk-slate/70">
            No impressions in this window.
          </p>
        )}
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Paid — Ads vs Analytics" note={totals.ga4Paid > 0 ? "paid sessions" : "all sessions"}>
          <div className="grid grid-cols-2 gap-px border-t border-tk-slate/[.06]">
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
                Ads clicks
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tk-onyx">
                {fmtInt(totals.adClicks)}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
                {totals.ga4Paid > 0 ? "GA4 paid sessions" : "GA4 sessions"}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tk-onyx">
                {fmtInt(hasGa4 ? paidSeen : null)}
              </p>
            </div>
          </div>
          <p className="border-t border-tk-slate/[.06] px-5 py-3 text-xs leading-relaxed text-tk-slate/65">
            {hasGa4 && paidCapture != null ? (
              <>
                Analytics counted{" "}
                {paidCapture < 10 ? paidCapture.toFixed(1) : Math.round(paidCapture)}% of the
                clicks Google Ads billed. That gap is the cookie banner, not a quieter campaign.
              </>
            ) : (
              "Attach Analytics on this site to read how many billed clicks the property counted."
            )}
          </p>
        </Card>

        <Card
          title="Cost of an enquiry"
          note={totals.adConversions > 0 ? "from Ads conversions" : "needs conversions"}
        >
          <div className="grid grid-cols-2 gap-px border-t border-tk-slate/[.06]">
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
                Spend
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tk-onyx">
                {fmtMoney(totals.adSpend, currency)}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
                Per conversion
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tk-onyx">
                {rates.cpa == null ? "—" : fmtMoney(rates.cpa, currency)}
              </p>
            </div>
          </div>
          <p className="border-t border-tk-slate/[.06] px-5 py-3 text-xs leading-relaxed text-tk-slate/65">
            {totals.adConversions > 0
              ? `${fmtConv(totals.adConversions)} conversions in this window, billed at ${fmtMoney(totals.adSpend, currency)}.`
              : "No conversions in this window — CPA stays blank until Ads records one."}
          </p>
        </Card>
      </div>
    </>
  )
}
