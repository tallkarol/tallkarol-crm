import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { sites, snapshotArchive } from "@/db/schema"
import { BarList } from "@/components/insights/BarList"
import { PrintButton } from "@/components/insights/PrintButton"
import { PrintTrend } from "@/components/insights/PrintTrend"
import { SearchTable } from "@/components/insights/SearchTable"
import { getSessionUser } from "@/lib/auth"
import { getPortalScope } from "@/lib/portal"
import { fmtConv, fmtDayYear, fmtInt, fmtMoney } from "@/lib/insights/derive"
import type { ArchivePayload } from "@/lib/insights/types"

export const metadata = { title: "Snapshot report" }
export const dynamic = "force-dynamic"

function pct(cur: number, prev: number | null | undefined) {
  if (prev == null || prev === 0) return null
  return ((cur - prev) / prev) * 100
}

function Stat({
  label,
  value,
  change,
  goodWhenUp = true,
}: {
  label: string
  value: string
  change: number | null
  goodWhenUp?: boolean
}) {
  const good = change == null || change === 0 ? null : change > 0 === goodWhenUp
  return (
    <div className="rounded-xl border border-tk-slate/15 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tk-slate/60">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold text-tk-onyx">{value}</p>
      <p
        className="text-[10.5px] font-bold"
        style={{ color: good == null ? "#6C7975" : good ? "#1B6B3A" : "#A62228" }}
      >
        {change == null
          ? "no prior month"
          : `${change > 0 ? "▲" : change < 0 ? "▼" : "—"} ${Math.abs(change).toFixed(
              Math.abs(change) < 10 ? 1 : 0
            )}% vs prior month`}
      </p>
    </div>
  )
}

/**
 * The downloadable artifact: a client-safe, print-ready month report rendered
 * from a frozen archive row. PDF = the browser's Save as PDF.
 */
export default async function InsightsReportPage({
  params,
  searchParams,
}: {
  params: { site: string }
  searchParams: { period?: string; sections?: string }
}) {
  // Admins see every site; portal customers only the sites of clients they
  // hold grants for — the portal Reports tab links straight here.
  const user = await getSessionUser()

  const site = await db.query.sites.findFirst({ where: eq(sites.slug, params.site) })
  if (!site) notFound()

  if (!user) {
    const scope = await getPortalScope()
    if (!scope) redirect("/login")
    const allowed = site.clientId && scope.clients.some((c) => c.id === site.clientId)
    if (!allowed) notFound()
  }

  const period = searchParams.period || ""
  const archive = await db.query.snapshotArchive.findFirst({
    where: and(eq(snapshotArchive.siteId, site.id), eq(snapshotArchive.period, period)),
  })
  if (!archive) notFound()
  const data = archive.payload as ArchivePayload

  const picked = new Set(
    (searchParams.sections || "trend,search,pages,conversions").split(",").filter(Boolean)
  )
  const hasGa4 = data.ga4.ok
  const hasGsc = data.gsc.ok
  const hasAds = Boolean(data.ads?.ok)
  const t = data.totals
  const p = data.previous

  return (
    <div className="mx-auto max-w-[820px] px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <style>{`@page { margin: 14mm 12mm; } @media print { body { background: #fff; } }`}</style>

      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={user ? `/insights/${site.slug}/reports` : "/portal/reports"}
          className="text-xs font-semibold text-tk-teal hover:underline"
        >
          {user ? "← Back to Insights" : "← Back to your portal"}
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-2xl border border-tk-slate/15 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-tk-teal pb-5">
          <div>
            <p className="text-[11px] font-bold tracking-[0.14em] text-tk-teal">
              TALLKAROL · INSIGHTS
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-tk-onyx">
              {site.name} — {data.label}
            </h1>
            <p className="mt-1 text-xs text-tk-slate/60">
              {fmtDayYear(data.range.start)} to {fmtDayYear(data.range.end)}
              {data.partial ? " · month to date" : ""}
            </p>
          </div>
          <p className="text-right text-[10.5px] leading-relaxed text-tk-slate/55">
            Generated {fmtDayYear(data.generatedAt.slice(0, 10))}
            <br />
            tallkarol.com
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {hasGa4 ? (
            <>
              <Stat label="Users" value={fmtInt(t.users)} change={pct(t.users, p?.users)} />
              <Stat label="Sessions" value={fmtInt(t.sessions)} change={pct(t.sessions, p?.sessions)} />
              <Stat label="Key events" value={fmtInt(t.keyEvents)} change={pct(t.keyEvents, p?.keyEvents)} />
            </>
          ) : null}
          {hasGsc ? (
            <>
              <Stat label="Search clicks" value={fmtInt(t.clicks)} change={pct(t.clicks, p?.clicks)} />
              <Stat
                label="Impressions"
                value={fmtInt(t.impressions)}
                change={pct(t.impressions, p?.impressions)}
              />
              <Stat
                label="Avg position"
                value={t.avgPosition == null ? "—" : t.avgPosition.toFixed(1)}
                change={
                  t.avgPosition != null && p?.avgPosition != null
                    ? pct(t.avgPosition, p.avgPosition)
                    : null
                }
                goodWhenUp={false}
              />
            </>
          ) : null}
          {hasAds ? (
            <>
              <Stat
                label="Ad spend"
                value={fmtMoney(t.adSpend ?? 0, data.ads?.currency ?? "USD")}
                change={pct(t.adSpend ?? 0, p?.adSpend)}
                goodWhenUp={false}
              />
              <Stat
                label="Ad clicks"
                value={fmtInt(t.adClicks ?? 0)}
                change={pct(t.adClicks ?? 0, p?.adClicks)}
              />
              <Stat
                label="Ad conversions"
                value={fmtConv(t.adConversions ?? 0)}
                change={pct(t.adConversions ?? 0, p?.adConversions)}
              />
            </>
          ) : null}
        </section>

        {picked.has("trend") && (hasGa4 || hasGsc) ? (
          <section className="mt-7 break-inside-avoid">
            <h2 className="text-sm font-bold text-tk-onyx">
              Daily {hasGa4 ? "sessions" : "search clicks"}
            </h2>
            <div className="mt-2 rounded-xl border border-tk-slate/12 p-4">
              <PrintTrend
                points={data.daily}
                metric={hasGa4 ? "sessions" : "clicks"}
                label={hasGa4 ? "sessions" : "clicks"}
                series={hasGa4 ? "teal" : "amber"}
              />
            </div>
          </section>
        ) : null}

        {picked.has("trend") && hasGa4 ? (
          <section className="mt-6 break-inside-avoid">
            <h2 className="text-sm font-bold text-tk-onyx">Where sessions came from</h2>
            <div className="mt-2 rounded-xl border border-tk-slate/12">
              <BarList rows={data.ga4.channels.slice(0, 6)} />
            </div>
          </section>
        ) : null}

        {picked.has("pages") && hasGa4 ? (
          <section className="mt-6 break-inside-avoid">
            <h2 className="text-sm font-bold text-tk-onyx">Top pages</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-tk-slate/12">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-tk-slate/12 text-left text-[10px] font-bold uppercase tracking-wide text-tk-slate/55">
                    <th className="px-4 py-2 font-bold">Page</th>
                    <th className="px-4 py-2 text-right font-bold">Sessions</th>
                    <th className="px-4 py-2 text-right font-bold">Key events</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ga4.pages.slice(0, 8).map((row) => (
                    <tr key={row.name} className="border-b border-tk-slate/[.06] last:border-0">
                      <td className="max-w-[24rem] truncate px-4 py-2 font-medium text-tk-onyx">
                        {row.name}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtInt(row.sessions)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtInt(row.keyEvents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {picked.has("search") && hasGsc ? (
          <section className="mt-6 break-inside-avoid">
            <h2 className="text-sm font-bold text-tk-onyx">Search queries</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-tk-slate/12">
              <SearchTable rows={data.gsc.queries} nameHeader="Query" limit={10} />
            </div>
            <p className="mt-1.5 text-[10px] text-tk-slate/55">
              Position movement compares the preceding window of the same length.
            </p>
          </section>
        ) : null}

        {picked.has("conversions") && data.crm ? (
          <section className="mt-6 break-inside-avoid">
            <h2 className="text-sm font-bold text-tk-onyx">Inquiries</h2>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-tk-slate/12 px-4 py-3">
                <p className="text-xl font-semibold text-tk-onyx">{fmtInt(data.crm.inquiries)}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tk-slate/60">
                  New inquiries
                </p>
              </div>
              <div className="rounded-xl border border-tk-slate/12 px-4 py-3">
                <p className="text-xl font-semibold text-tk-onyx">{fmtInt(data.crm.fit)}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tk-slate/60">
                  Qualified
                </p>
              </div>
              <div className="rounded-xl border border-tk-slate/12 px-4 py-3">
                <p className="truncate text-sm font-semibold text-tk-onyx">
                  {data.crm.topSource ?? "—"}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tk-slate/60">
                  Top source
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <footer className="mt-8 border-t border-tk-slate/12 pt-3 text-[10px] text-tk-slate/50">
          Prepared with the TALLKAROL Insights hub from a snapshot frozen on{" "}
          {fmtDayYear(data.generatedAt.slice(0, 10))}. GA4 and Search Console are
          read via their official APIs; search data lags about two days.
        </footer>
      </div>
    </div>
  )
}
