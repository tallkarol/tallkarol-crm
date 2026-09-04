import Link from "next/link"
import { db } from "@/db"
import type { Client, GscFinding, Site } from "@/db/schema"
import { Card } from "@/components/insights/Card"
import { BarList, MeterList } from "@/components/insights/BarList"
import { Delta, KpiTile, PositionKpiDelta } from "@/components/insights/KpiTile"
import { PrintTrend } from "@/components/insights/PrintTrend"
import { SearchTable } from "@/components/insights/SearchTable"
import { scopeAdsSnapshot } from "@/lib/insights/ads-split"
import { CHART } from "@/lib/insights/chart"
import {
  deltaPct,
  deriveWindow,
  fmtConv,
  fmtDayYear,
  fmtInt,
  fmtMoney,
  parseRange,
  todayKey,
  type RangeDays,
} from "@/lib/insights/derive"
import { latestScan, maintenancePackage, openFindings } from "@/lib/insights/gsc-queries"
import { RULE_LABELS } from "@/lib/insights/gsc-rules"
import {
  insightsCacheKey,
  TABLE_WINDOW_DAYS,
  type PageSpeedScores,
  type SnapshotV2,
} from "@/lib/insights/types"
import { readReport } from "@/lib/report-cache"

/* Everything in this file is CLIENT-SAFE: no rates, margins, internal notes,
   source-setup details, or other clients' anything. The site list is scoped by
   client id up front, and the snapshot is read from the local cache only —
   this page never calls Google. */

function scopedIds(clients: Client[]) {
  return clients.map((c) => c.id)
}

function pillClass(active: boolean) {
  return active
    ? "rounded-full border border-tk-teal bg-tk-teal/10 px-3 py-1 text-xs font-semibold text-tk-teal"
    : "rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
}

/* --------------------------------------------------------------- pagespeed */

function scoreColor(score: number | null) {
  if (score == null) return "#6C7975"
  if (score >= 90) return CHART.good
  if (score >= 50) return "#B07818"
  return CHART.bad
}

function vitalColor(value: number | null, good: number, poor: number) {
  if (value == null) return "#6C7975"
  if (value <= good) return CHART.good
  if (value <= poor) return "#B07818"
  return CHART.bad
}

function ScoreRow({ label, scores }: { label: string; scores: PageSpeedScores }) {
  const cells: { name: string; score: number | null }[] = [
    { name: "Performance", score: scores.performance },
    { name: "Accessibility", score: scores.accessibility },
    { name: "Best practices", score: scores.bestPractices },
    { name: "SEO", score: scores.seo },
  ]
  return (
    <div className="grid grid-cols-[4.5rem_repeat(4,1fr)] items-center gap-2 px-5 py-3">
      <p className="text-xs font-medium capitalize text-tk-onyx">{label}</p>
      {cells.map((cell) => (
        <div key={cell.name} className="text-center">
          <p
            className="text-xl font-semibold tabular-nums leading-tight"
            style={{ color: scoreColor(cell.score) }}
          >
            {cell.score ?? "—"}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-tk-slate/55">
            {cell.name}
          </p>
        </div>
      ))}
    </div>
  )
}

function Vitals({ scores }: { scores: PageSpeedScores }) {
  if (scores.lcpMs == null && scores.inpMs == null && scores.cls == null) return null
  const vitals = [
    {
      name: "Largest Contentful Paint",
      value: scores.lcpMs == null ? "—" : `${(scores.lcpMs / 1000).toFixed(1)} s`,
      color: vitalColor(scores.lcpMs, 2500, 4000),
    },
    {
      name: "Interaction to Next Paint",
      value: scores.inpMs == null ? "—" : `${Math.round(scores.inpMs)} ms`,
      color: vitalColor(scores.inpMs, 200, 500),
    },
    {
      name: "Cumulative Layout Shift",
      value: scores.cls == null ? "—" : scores.cls.toFixed(2),
      color: vitalColor(scores.cls, 0.1, 0.25),
    },
  ]
  return (
    <div className="grid grid-cols-3 divide-x divide-tk-slate/10 border-t border-tk-slate/10">
      {vitals.map((v) => (
        <div key={v.name} className="px-5 py-3">
          <p className="text-base font-semibold tabular-nums" style={{ color: v.color }}>
            {v.value}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-tk-slate/55">
            {v.name}
          </p>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- seo health */

const SEVERITY_LABEL: Record<number, string> = {
  1: "Blocking",
  2: "Should fix",
  3: "Watch",
}

function findingPath(url: string) {
  try {
    return new URL(url).pathname || url
  } catch {
    return url
  }
}

function SeoStat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="px-5 py-3">
      <p className="text-xl font-semibold tabular-nums text-tk-onyx">{n}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
        {label}
      </p>
    </div>
  )
}

function FindingList({ findings }: { findings: GscFinding[] }) {
  return (
    <ul className="divide-y divide-tk-slate/10">
      {findings.map((f) => (
        <li key={f.id} className="px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                f.severity === 1
                  ? "bg-[#B91C1C]/10 text-[#B91C1C]"
                  : "bg-[#B45309]/10 text-[#92400E]"
              }`}
            >
              {SEVERITY_LABEL[f.severity] ?? "Finding"}
            </span>
            <p className="text-sm font-medium text-tk-onyx">{RULE_LABELS[f.rule] ?? f.rule}</p>
            {f.url ? <code className="text-xs text-tk-slate/70">{findingPath(f.url)}</code> : null}
          </div>
          {f.detail ? (
            <p className="mt-1 text-sm leading-relaxed text-tk-slate/70">{f.detail}</p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------- main */

export async function PortalInsights({
  clients,
  siteParam,
  rangeParam,
}: {
  clients: Client[]
  siteParam?: string
  rangeParam?: string
}) {
  const ids = scopedIds(clients)
  const sites = await db.query.sites
    .findMany()
    .then((rows) =>
      rows
        .filter((s) => s.clientId && ids.includes(s.clientId))
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    )
    .catch(() => [] as Site[])

  if (sites.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
        <p className="px-4 py-8 text-sm text-tk-slate/60">
          Your site analytics are being connected — this page lights up as soon as
          the first snapshot is in.
        </p>
      </div>
    )
  }

  const site = sites.find((s) => s.slug === siteParam) ?? sites[0]
  const range = parseRange(rangeParam)
  const cached = await readReport<SnapshotV2>(insightsCacheKey(site.slug))
  const raw = cached.payload?.version === 2 ? cached.payload : null
  const snapshot = raw ? scopeAdsSnapshot(raw, site) : null

  const period = todayKey().slice(0, 7)
  const [scan, open, pkg] = await Promise.all([
    latestScan(site.id).catch(() => null),
    openFindings(site.id).catch(() => [] as GscFinding[]),
    maintenancePackage(site.id, period).catch(() => null),
  ])

  const rangeLink = (days: RangeDays) =>
    `/portal/insights?site=${site.slug}&range=${days}`

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {sites.length > 1
            ? sites.map((s) => (
                <Link
                  key={s.id}
                  href={`/portal/insights?site=${s.slug}&range=${range}`}
                  className={pillClass(s.id === site.id)}
                >
                  {s.name}
                </Link>
              ))
            : null}
        </div>
        <div className="flex items-center gap-1.5">
          {([7, 28, 90] as const).map((days) => (
            <Link key={days} href={rangeLink(days)} className={pillClass(days === range)}>
              {days} days
            </Link>
          ))}
        </div>
      </div>

      {!snapshot ? (
        <div className="mt-3.5 rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
          <p className="px-4 py-8 text-sm text-tk-slate/60">
            The first analytics snapshot for {site.name} hasn&rsquo;t been generated
            yet — check back shortly.
          </p>
        </div>
      ) : (
        <PortalInsightsBody site={site} snapshot={snapshot} range={range} />
      )}

      {scan ? (
        <Card
          title="Search index health"
          note={`last checked ${fmtDayYear(scan.scannedOn)}`}
          className="mt-3.5"
        >
          <div className="grid grid-cols-2 divide-x divide-tk-slate/10 border-b border-tk-slate/10 sm:grid-cols-4">
            <SeoStat n={`${scan.passCount}/${scan.urlCount}`} label="Pages indexed" />
            <SeoStat n={open.filter((f) => f.severity <= 2).length} label="Being fixed" />
            <SeoStat n={pkg?.resolved.length ?? 0} label="Fixed this month" />
            <SeoStat n={open.filter((f) => f.severity === 3).length} label="Watching" />
          </div>
          {open.filter((f) => f.severity <= 2).length === 0 ? (
            <p className="px-5 py-4 text-sm text-tk-slate/70">
              Nothing outstanding — {scan.passCount} of {scan.urlCount} sitemap pages
              are indexed by Google.
            </p>
          ) : (
            <FindingList findings={open.filter((f) => f.severity <= 2)} />
          )}
          {pkg && pkg.resolved.length > 0 ? (
            <div className="border-t border-tk-slate/10 bg-tk-linen/40">
              <p className="px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
                Fixed this month
              </p>
              <ul className="divide-y divide-tk-slate/10">
                {pkg.resolved.map((f) => (
                  <li key={f.id} className="px-5 py-2.5">
                    <p className="text-sm text-tk-onyx">
                      {RULE_LABELS[f.rule] ?? f.rule}{" "}
                      {f.url ? (
                        <code className="text-xs text-tk-slate/70">{findingPath(f.url)}</code>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-tk-slate/55">
                      Found {fmtDayYear(f.firstSeenOn)} · resolved{" "}
                      {f.resolvedOn ? fmtDayYear(f.resolvedOn) : "recently"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  )
}

function PortalInsightsBody({
  site,
  snapshot,
  range,
}: {
  site: Site
  snapshot: SnapshotV2
  range: RangeDays
}) {
  const win = deriveWindow(snapshot, range)
  const t = win.totals
  const p = win.previousTotals
  const hasGa4 = snapshot.ga4.ok
  const hasGsc = snapshot.gsc.ok
  const hasAds = snapshot.ads.ok
  const ps = snapshot.pagespeed?.ok ? snapshot.pagespeed : null
  const currency = snapshot.ads.currency || "USD"
  const spark = (pick: (d: SnapshotV2["daily"][number]) => number) => win.current.map(pick)

  return (
    <>
      <p className="mt-3 text-[11px] text-tk-slate/50">
        {win.label} · data through {fmtDayYear(snapshot.fetchedAt.slice(0, 10))} · read
        from the Google APIs by TALLKAROL
      </p>

      <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hasGa4 ? (
          <>
            <KpiTile
              label="Visitors"
              value={fmtInt(t.users)}
              delta={<Delta pct={deltaPct(t.users, p?.users)} />}
              spark={spark((d) => d.users)}
            />
            <KpiTile
              label="Sessions"
              value={fmtInt(t.sessions)}
              delta={<Delta pct={deltaPct(t.sessions, p?.sessions)} />}
              spark={spark((d) => d.sessions)}
            />
            <KpiTile
              label="Key events"
              value={fmtInt(t.keyEvents)}
              delta={<Delta pct={deltaPct(t.keyEvents, p?.keyEvents)} />}
              spark={spark((d) => d.keyEvents)}
            />
          </>
        ) : null}
        {hasGsc ? (
          <>
            <KpiTile
              label="Search clicks"
              value={fmtInt(t.clicks)}
              delta={<Delta pct={deltaPct(t.clicks, p?.clicks)} />}
              spark={spark((d) => d.clicks)}
              series="amber"
            />
            <KpiTile
              label="Search impressions"
              value={fmtInt(t.impressions)}
              delta={<Delta pct={deltaPct(t.impressions, p?.impressions)} />}
              spark={spark((d) => d.impressions)}
              series="amber"
            />
            <KpiTile
              label="Avg position"
              value={t.avgPosition == null ? "—" : t.avgPosition.toFixed(1)}
              delta={
                <PositionKpiDelta
                  current={t.avgPosition}
                  previous={p?.avgPosition ?? null}
                />
              }
              footnote="Google ranking across all queries — lower is better"
            />
          </>
        ) : null}
        {hasAds ? (
          <>
            <KpiTile
              label="Ad spend"
              value={fmtMoney(t.adSpend, currency)}
              delta={<Delta pct={deltaPct(t.adSpend, p?.adSpend)} goodWhenUp={false} />}
              spark={spark((d) => d.adSpend)}
              series="ink"
            />
            <KpiTile
              label="Ad clicks"
              value={fmtInt(t.adClicks)}
              delta={<Delta pct={deltaPct(t.adClicks, p?.adClicks)} />}
              spark={spark((d) => d.adClicks)}
              series="ink"
            />
            <KpiTile
              label="Ad conversions"
              value={fmtConv(t.adConversions)}
              delta={<Delta pct={deltaPct(t.adConversions, p?.adConversions)} />}
              spark={spark((d) => d.adConversions)}
              series="ink"
            />
          </>
        ) : null}
      </div>

      {hasGa4 || hasGsc ? (
        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
          {hasGa4 ? (
            <Card title="Daily sessions" note={win.label}>
              <div className="px-5 pb-4 pt-2">
                <PrintTrend points={win.current} metric="sessions" label="sessions" series="teal" />
              </div>
            </Card>
          ) : null}
          {hasGsc ? (
            <Card title="Daily search clicks" note={win.label}>
              <div className="px-5 pb-4 pt-2">
                <PrintTrend points={win.current} metric="clicks" label="clicks" series="amber" />
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {hasGa4 ? (
        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
          <Card title="Where visits come from" note={`last ${TABLE_WINDOW_DAYS} days`}>
            <BarList rows={snapshot.ga4.channels.slice(0, 8)} />
          </Card>
          <div className="grid gap-3.5">
            <Card title="Devices" note={`last ${TABLE_WINDOW_DAYS} days`}>
              <MeterList rows={snapshot.ga4.devices} />
            </Card>
            <Card title="Countries" note={`last ${TABLE_WINDOW_DAYS} days`}>
              <BarList rows={snapshot.ga4.countries.slice(0, 6)} />
            </Card>
          </div>
        </div>
      ) : null}

      {hasGsc ? (
        <>
          <Card
            title="What people search to find you"
            note={`last ${TABLE_WINDOW_DAYS} days · position movement vs the window before`}
            className="mt-3.5"
          >
            <SearchTable rows={snapshot.gsc.queries} nameHeader="Query" limit={10} />
          </Card>
          <Card
            title="Pages winning in search"
            note={`last ${TABLE_WINDOW_DAYS} days`}
            className="mt-3.5"
          >
            <SearchTable rows={snapshot.gsc.pages} nameHeader="Page" limit={10} />
          </Card>
        </>
      ) : null}

      {hasAds && snapshot.ads.campaigns.length > 0 ? (
        <Card
          title="Google Ads campaigns"
          note={`last ${TABLE_WINDOW_DAYS} days · ${snapshot.ads.accountName}`}
          className="mt-3.5"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-tk-slate/12 text-left text-[10px] font-bold uppercase tracking-wide text-tk-slate/55">
                  <th className="px-5 py-2 font-bold">Campaign</th>
                  <th className="px-3 py-2 text-right font-bold">Impressions</th>
                  <th className="px-3 py-2 text-right font-bold">Clicks</th>
                  <th className="px-3 py-2 text-right font-bold">Spend</th>
                  <th className="px-5 py-2 text-right font-bold">Conversions</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.ads.campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-tk-slate/[.06] last:border-0">
                    <td className="max-w-[22rem] truncate px-5 py-2 font-medium text-tk-onyx" title={c.name}>
                      {c.name}
                      {c.status && c.status !== "ENABLED" ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-tk-slate/50">
                          {c.status.toLowerCase()}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">{fmtInt(c.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">{fmtInt(c.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">{fmtMoney(c.spend, currency)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-tk-onyx">{fmtConv(c.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {ps ? (
        <Card
          title="Site speed"
          note={`Google PageSpeed · checked ${fmtDayYear(ps.fetchedAt.slice(0, 10))}`}
          className="mt-3.5"
        >
          <div className="divide-y divide-tk-slate/10">
            {ps.mobile ? <ScoreRow label="mobile" scores={ps.mobile} /> : null}
            {ps.desktop ? <ScoreRow label="desktop" scores={ps.desktop} /> : null}
          </div>
          {ps.mobile ? <Vitals scores={ps.mobile} /> : null}
          <p className="border-t border-tk-slate/10 px-5 py-2.5 text-[11px] text-tk-slate/55">
            Scores are Google Lighthouse audits of {ps.url}; the loading metrics are
            what real visitors experienced over the last 28 days where Google has
            enough traffic to report them.
          </p>
        </Card>
      ) : null}
    </>
  )
}
