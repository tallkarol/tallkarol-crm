import { notFound } from "next/navigation"
import { Card } from "@/components/insights/Card"
import { EmptySnapshot } from "@/components/insights/EmptySnapshot"
import { Delta, KpiTile } from "@/components/insights/KpiTile"
import { OverlayChart, type OverlaySeries } from "@/components/insights/OverlayChart"
import { RangeSwitcher } from "@/components/insights/RangeSwitcher"
import { CHART } from "@/lib/insights/chart"
import { deltaPct, deriveWindow, fmtInt, fmtMoney, parseRange } from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"

export const metadata = { title: "Unfiltered traffic · Insights" }
export const dynamic = "force-dynamic"

function capture(seen: number, billed: number) {
  if (billed <= 0) return null
  return (seen / billed) * 100
}

function fmtCapture(pct: number | null) {
  if (pct == null) return "—"
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`
}

export default async function InsightsUnfilteredPage({
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

  const range = parseRange(searchParams.range)
  const win = deriveWindow(snapshot, range)
  const { totals, previousTotals: prev } = win
  const hasGa4 = snapshot.ga4.ok
  const hasGsc = snapshot.gsc.ok
  const hasAds = Boolean(snapshot.ads?.ok)
  const hasHost = Boolean(snapshot.vercel?.ok) || totals.vercelPageviews > 0
  const hasPaidSplit = totals.ga4Paid > 0 || (prev?.ga4Paid ?? 0) > 0
  const hasOrganicSplit = totals.ga4Organic > 0 || (prev?.ga4Organic ?? 0) > 0

  const paidSeen = hasPaidSplit ? totals.ga4Paid : totals.sessions
  const paidSeenPrev = hasPaidSplit ? prev?.ga4Paid : prev?.sessions
  const organicSeen = hasOrganicSplit ? totals.ga4Organic : totals.sessions
  const organicSeenPrev = hasOrganicSplit ? prev?.ga4Organic : prev?.sessions

  const paidCapture = hasAds ? capture(paidSeen, totals.adClicks) : null
  const paidCapturePrev =
    hasAds && paidSeenPrev != null && prev ? capture(paidSeenPrev, prev.adClicks) : null
  const searchCapture = hasGsc ? capture(organicSeen, totals.clicks) : null
  const searchCapturePrev =
    hasGsc && organicSeenPrev != null && prev ? capture(organicSeenPrev, prev.clicks) : null

  const series: OverlaySeries[] = []
  if (hasHost) {
    series.push({
      id: "host",
      label: "Host pageviews",
      color: CHART.host,
      values: win.current.map((p) => p.vercelPageviews ?? 0),
    })
  }
  if (hasAds) {
    series.push({
      id: "ads",
      label: "Ads clicks",
      color: CHART.ink,
      values: win.current.map((p) => p.adClicks ?? 0),
    })
  }
  if (hasGsc) {
    series.push({
      id: "gsc",
      label: "Search clicks",
      color: CHART.amber,
      values: win.current.map((p) => p.clicks),
    })
  }
  if (hasGa4) {
    series.push({
      id: "ga4",
      label: "Analytics sessions",
      color: CHART.teal,
      values: win.current.map((p) => p.sessions),
    })
  }

  const spark = (key: "sessions" | "clicks" | "adClicks" | "ga4Paid" | "ga4Organic") =>
    win.current.map((p) => p[key] ?? 0)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs leading-relaxed text-ink-3">
          Ads clicks and Search Console clicks are counted by Google, not the site — they do not
          wait for the cookie banner. Analytics sessions only count visitors who accepted.{" "}
          {site.slug === "mycustommanufacturer"
            ? "Host pageviews are Vercel (cookieless). Ads and Search Console are Google's own meters. Analytics sessions only count people who accepted cookies. Server-side here fires lead events on submit, not page views."
            : "Host pageviews, where a host meter is attached, are cookieless. Server-side lead events sit below this chart — they are not a session count."}
        </p>
        <RangeSwitcher />
      </div>

      <p className="mt-3 text-xs text-ink-3">
        {win.label} · vs. previous {prev ? `${range} days` : "window (not covered)"}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Ads clicks"
          value={fmtInt(hasAds ? totals.adClicks : null)}
          delta={<Delta pct={hasAds ? deltaPct(totals.adClicks, prev?.adClicks) : null} />}
          spark={hasAds ? spark("adClicks") : undefined}
          series="ink"
          footnote={hasAds ? undefined : "No Ads account on this site"}
        />
        <KpiTile
          label="Search clicks"
          value={fmtInt(hasGsc ? totals.clicks : null)}
          delta={<Delta pct={hasGsc ? deltaPct(totals.clicks, prev?.clicks) : null} />}
          spark={hasGsc ? spark("clicks") : undefined}
          series="amber"
          footnote={hasGsc ? undefined : "Search Console is not connected"}
        />
        <KpiTile
          label="Analytics sessions"
          value={fmtInt(hasGa4 ? totals.sessions : null)}
          delta={<Delta pct={hasGa4 ? deltaPct(totals.sessions, prev?.sessions) : null} />}
          spark={hasGa4 ? spark("sessions") : undefined}
          footnote="cookie-gated"
        />
        <KpiTile
          label="Paid visibility"
          value={fmtCapture(paidCapture)}
          delta={
            <Delta
              abs={
                paidCapture != null && paidCapturePrev != null
                  ? Number((paidCapture - paidCapturePrev).toFixed(1))
                  : null
              }
            />
          }
          footnote={
            hasAds
              ? hasPaidSplit
                ? "GA4 paid sessions ÷ Ads clicks"
                : "GA4 all sessions ÷ Ads clicks — Refresh for a paid-only split"
              : "Needs Ads + Analytics"
          }
        />
      </div>

      <Card
        title="The meters on one axis"
        note={series.length < 2 ? "connect another source" : "same scale on purpose"}
        className="mt-3"
      >
        {series.length >= 2 ? (
          <OverlayChart dates={win.current.map((p) => p.date)} series={series} />
        ) : (
          <p className="px-5 py-8 text-sm text-ink-3">
            This view needs at least two of Ads, Search Console, and Analytics. See Health.
          </p>
        )}
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Paid — Ads vs Analytics" note={hasPaidSplit ? "paid sessions" : "all sessions"}>
          <div className="grid grid-cols-2 gap-px border-t border-line">
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Ads clicks
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tk-onyx">
                {fmtInt(hasAds ? totals.adClicks : null)}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {hasPaidSplit ? "GA4 paid sessions" : "GA4 sessions"}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tk-onyx">
                {fmtInt(hasGa4 ? paidSeen : null)}
              </p>
            </div>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-3">
            {hasAds && hasGa4 ? (
              <>
                Analytics counted {fmtCapture(paidCapture)} of the clicks Google Ads billed. That
                gap is the cookie banner (and late-loading tags), not a quieter campaign.
              </>
            ) : (
              "Attach Ads and Analytics on this site to read paid visibility."
            )}
          </p>
        </Card>

        <Card
          title="Search — Console vs Analytics"
          note={hasOrganicSplit ? "organic sessions" : "all sessions"}
        >
          <div className="grid grid-cols-2 gap-px border-t border-line">
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Search clicks
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tk-onyx">
                {fmtInt(hasGsc ? totals.clicks : null)}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {hasOrganicSplit ? "GA4 organic sessions" : "GA4 sessions"}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tk-onyx">
                {fmtInt(hasGa4 ? organicSeen : null)}
              </p>
            </div>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-3">
            {hasGsc && hasGa4 ? (
              <>
                Search Console counted {fmtInt(totals.clicks)} clicks; Analytics counted{" "}
                {fmtInt(organicSeen)}{" "}
                {hasOrganicSplit ? "organic sessions" : "sessions"} ({fmtCapture(searchCapture)}).
                Same consent hole, organic side.
              </>
            ) : (
              "Attach Search Console and Analytics on this site to read search visibility."
            )}
          </p>
        </Card>
      </div>

      {hasAds && snapshot.ads.campaigns.length > 0 ? (
        <Card
          title="Campaigns in this Ads account"
          note={`${snapshot.ads.accountName} · 28d table`}
          className="mt-3"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-5 py-2 font-bold">Campaign</th>
                  <th className="px-3 py-2 text-right font-bold">Clicks</th>
                  <th className="px-3 py-2 text-right font-bold">Impr.</th>
                  <th className="px-5 py-2 text-right font-bold">Spend</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.ads.campaigns.map((row) => (
                  <tr key={row.id || row.name} className="border-b border-line last:border-0">
                    <td className="max-w-[22rem] truncate px-5 py-2 font-medium text-tk-onyx">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(row.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(row.impressions)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">
                      {fmtMoney(row.spend, snapshot.ads.currency || "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  )
}
