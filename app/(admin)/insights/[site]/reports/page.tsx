import Link from "next/link"
import { notFound } from "next/navigation"
import { desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { snapshotArchive } from "@/db/schema"
import { Badge } from "@/components/work/Badge"
import { Card } from "@/components/insights/Card"
import { MarkFiled, ReportBuilder } from "@/components/insights/ReportBits"
import { isHouseSite } from "@/lib/insights/crm"
import { monthLabel, todayKey } from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"
import type { ArchivePayload } from "@/lib/insights/types"

export const metadata = { title: "Reports · Insights" }
export const dynamic = "force-dynamic"

export default async function InsightsReportsPage({
  params,
}: {
  params: { site: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx) notFound()
  const { site, snapshot } = ctx

  const archives = await db.query.snapshotArchive.findMany({
    where: eq(snapshotArchive.siteId, site.id),
    with: { report: true },
    orderBy: [desc(snapshotArchive.period)],
  })

  // Months the cached snapshot can freeze, newest first.
  const currentPeriod = todayKey().slice(0, 7)
  const months = Array.from(
    new Set((snapshot?.daily ?? []).map((p) => p.date.slice(0, 7)))
  )
    .sort()
    .reverse()
    .map((period) => ({
      period,
      label: period === currentPeriod ? `${monthLabel(period)} — to date` : monthLabel(period),
    }))

  return (
    <div className="grid gap-3 xl:grid-cols-12">
      <div className="xl:col-span-7">
        {archives.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-well px-6 py-10 text-center shadow-card">
            <p className="text-sm font-semibold text-tk-onyx">No frozen snapshots yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
              The first refresh after a month ends freezes it automatically, or
              generate one now from the panel on the right.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {archives.map((row) => {
              const payload = row.payload as ArchivePayload
              const filed = row.report?.status === "filed"
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-3.5 shadow-card"
                >
                  <div>
                    <p className="text-sm font-semibold text-tk-onyx">
                      {row.label || row.period} — monthly snapshot
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                      {payload?.range ? `${payload.range.start} → ${payload.range.end}` : row.period}
                      {payload?.partial ? <Badge tone="neutral">To date</Badge> : null}
                      <Badge tone={filed ? "muted" : "teal"}>{filed ? "Sent" : "Ready"}</Badge>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/insights-report/${site.slug}?period=${row.period}`}
                      className="rounded-md bg-accent px-2.5 py-1 text-[10.5px] font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90"
                    >
                      View / PDF
                    </Link>
                    <a
                      href={`/api/insights/export?site=${site.slug}&table=daily&period=${row.period}`}
                      download
                      className="rounded-md border border-line bg-card px-2 py-1 text-[10.5px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
                    >
                      Daily CSV ↓
                    </a>
                    <a
                      href={`/api/insights/export?site=${site.slug}&table=queries&period=${row.period}`}
                      download
                      className="rounded-md border border-line bg-card px-2 py-1 text-[10.5px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
                    >
                      Queries CSV ↓
                    </a>
                    <MarkFiled archiveId={row.id} filed={filed} />
                  </div>
                </div>
              )
            })}
            <p className="px-1 text-[11px] text-ink-3">
              A month freezes automatically on the first refresh after it ends,
              and its draft lands on the{" "}
              <Link href="/reports" className="font-semibold text-tk-teal hover:underline">
                Reports page
              </Link>{" "}
              with monthly cadence. Frozen months never change once the month is
              over — regenerate replaces only a to-date freeze.
            </p>
          </div>
        )}
      </div>

      <Card title="New snapshot report" className="self-start xl:col-span-5">
        <ReportBuilder slug={site.slug} months={months} isHouse={isHouseSite(site)} />
      </Card>
    </div>
  )
}
