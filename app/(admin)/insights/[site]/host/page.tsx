import { notFound } from "next/navigation"
import { BarList, MeterList } from "@/components/insights/BarList"
import { Card } from "@/components/insights/Card"
import { EmptySnapshot } from "@/components/insights/EmptySnapshot"
import { Delta, KpiTile } from "@/components/insights/KpiTile"
import { OverlayChart, type OverlaySeries } from "@/components/insights/OverlayChart"
import { RangeSwitcher } from "@/components/insights/RangeSwitcher"
import { CHART } from "@/lib/insights/chart"
import { deltaPct, deriveWindow, fmtInt, parseRange } from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"
import { TABLE_WINDOW_DAYS } from "@/lib/insights/types"
import { VERCEL_FETCH_DAYS } from "@/lib/insights/vercel"

export const metadata = { title: "Host traffic · Insights" }
export const dynamic = "force-dynamic"

function capture(seen: number, host: number) {
  if (host <= 0) return null
  return (seen / host) * 100
}

function fmtCapture(pct: number | null) {
  if (pct == null) return "—"
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`
}

export default async function InsightsHostPage({
  params,
  searchParams,
}: {
  params: { site: string }
  searchParams: { range?: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx) notFound()
  const { site, snapshot } = ctx
  if (!site.vercelProjectId) notFound()
  if (!snapshot) return <EmptySnapshot slug={site.slug} siteName={site.name} />

  const range = parseRange(searchParams.range)
  const win = deriveWindow(snapshot, range)
  const { totals, previousTotals: prev } = win
  const vercel = snapshot.vercel
  const hasHost = Boolean(vercel?.ok) || totals.vercelPageviews > 0
  const hasGa4 = snapshot.ga4.ok
  const hostCapture = hasHost && hasGa4 ? capture(totals.sessions, totals.vercelPageviews) : null
  const hostCapturePrev =
    hasHost && hasGa4 && prev
      ? capture(prev.sessions, prev.vercelPageviews)
      : null

  const series: OverlaySeries[] = []
  if (hasHost) {
    series.push({
      id: "host",
      label: "Host pageviews",
      color: CHART.host,
      values: win.current.map((p) => p.vercelPageviews ?? 0),
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

  const spark = (key: "vercelPageviews" | "vercelVisitors" | "sessions") =>
    win.current.map((p) => p[key] ?? 0)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs leading-relaxed text-tk-slate/60">
          Vercel Web Analytics — cookieless host counts, not the cookie banner.
          Vercel only serves the last {VERCEL_FETCH_DAYS} days; each refresh writes
          those days into this snapshot so the 90-day chart can keep growing.
        </p>
        <RangeSwitcher />
      </div>

      <p className="mt-3 text-xs text-tk-slate/60">
        {win.label} · vs. previous {prev ? `${range} days` : "window (not covered)"}
      </p>

      {!hasHost ? (
        <p className="mt-4 rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-10 text-center text-sm text-tk-slate/70 shadow-sm">
          {vercel?.error ||
            "Refresh to pull the first Vercel window. If this stays empty, Web Analytics is on but nothing has been counted yet — open a couple of production pages."}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Host pageviews"
          value={fmtInt(hasHost ? totals.vercelPageviews : null)}
          delta={<Delta pct={hasHost ? deltaPct(totals.vercelPageviews, prev?.vercelPageviews) : null} />}
          spark={hasHost ? spark("vercelPageviews") : undefined}
          series="ink"
        />
        <KpiTile
          label="Host visitors"
          value={fmtInt(hasHost ? totals.vercelVisitors : null)}
          delta={<Delta pct={hasHost ? deltaPct(totals.vercelVisitors, prev?.vercelVisitors) : null} />}
          spark={hasHost ? spark("vercelVisitors") : undefined}
          series="ink"
          footnote="daily hash — not a returning-user count"
        />
        <KpiTile
          label="Analytics sessions"
          value={fmtInt(hasGa4 ? totals.sessions : null)}
          delta={<Delta pct={hasGa4 ? deltaPct(totals.sessions, prev?.sessions) : null} />}
          spark={hasGa4 ? spark("sessions") : undefined}
          footnote="cookie-gated"
        />
        <KpiTile
          label="Banner capture"
          value={fmtCapture(hostCapture)}
          delta={
            <Delta
              abs={
                hostCapture != null && hostCapturePrev != null
                  ? Number((hostCapture - hostCapturePrev).toFixed(1))
                  : null
              }
            />
          }
          footnote={hasHost && hasGa4 ? "GA4 sessions ÷ host pageviews" : "Needs Host + Analytics"}
        />
      </div>

      <Card
        title="Host vs cookie-gated Analytics"
        note={series.length < 2 ? "connect Analytics" : "same scale on purpose"}
        className="mt-3"
      >
        {series.length >= 1 ? (
          <OverlayChart dates={win.current.map((p) => p.date)} series={series} />
        ) : (
          <p className="px-5 py-8 text-sm text-tk-slate/70">
            Refresh once Vercel has counted a visit.
          </p>
        )}
      </Card>

      <p className="mt-5 text-xs text-tk-slate/60">
        Paths, referrers, devices, and countries cover Vercel&apos;s last{" "}
        {VERCEL_FETCH_DAYS}-day window — not the range switcher. Traffic (GA4)
        tables stay on their own {TABLE_WINDOW_DAYS}-day fetch.
      </p>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card title="Pages">
          <BarList
            rows={vercel?.pages ?? []}
            color={CHART.host}
            emptyText="No host paths in the last window."
          />
        </Card>
        <Card title="Referrers">
          <BarList
            rows={vercel?.referrers ?? []}
            color={CHART.host}
            emptyText="No referrers in the last window."
          />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card title="Devices">
          <MeterList rows={vercel?.devices ?? []} />
        </Card>
        <Card title="Countries">
          <BarList
            rows={vercel?.countries ?? []}
            color={CHART.host}
            emptyText="No countries in the last window."
          />
        </Card>
      </div>
    </>
  )
}
