import Link from "next/link"
import { desc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/work/Badge"
import { db } from "@/db"
import { reports, snapshotArchive } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import type { ArchivePayload } from "@/lib/insights/types"
import { CADENCE_LABEL, REPORT_STATUS_LABEL } from "@/lib/work"

export const metadata = { title: "Reports" }
export const dynamic = "force-dynamic"

export default async function ReportsPage() {
  const [rows, archives] = await Promise.all([
    db.query.reports.findMany({
      orderBy: [desc(reports.createdAt)],
      with: {
        client: true,
        retainer: true,
        project: true,
      },
    }),
    db.query.snapshotArchive.findMany({
      orderBy: [desc(snapshotArchive.period)],
      with: { site: true, report: true },
      limit: 24,
    }),
  ])

  // Archives already show as generated snapshots — don't list their report
  // rows twice below.
  const generatedReportIds = new Set(
    archives.map((a) => a.reportId).filter(Boolean) as string[]
  )
  const manual = rows.filter((report) => !generatedReportIds.has(report.id))

  return (
    <>
      <PageHeader title="Reports" />

      {archives.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-tk-onyx">Generated snapshots</h2>
          <p className="mt-0.5 text-xs text-tk-slate/60">
            Frozen months from the Insights hub — view renders the client-safe
            report, PDF is the browser&rsquo;s Save as PDF.
          </p>
          <ul className="mt-3 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            {archives.map((row) => {
              const payload = row.payload as ArchivePayload
              const filed = row.report?.status === "filed"
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-tk-slate/10 px-5 py-3.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-tk-onyx">
                      {row.site.name} — {row.label || row.period}
                    </p>
                    <p className="mt-0.5 text-sm text-tk-slate/70">
                      Monthly snapshot
                      {payload?.partial ? " · to date" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={filed ? "muted" : "teal"}>{filed ? "Sent" : "Ready"}</Badge>
                    <Link
                      href={`/insights/${row.site.slug}/reports`}
                      className="rounded-md border border-tk-slate/20 bg-white px-2 py-1 text-[10.5px] font-semibold text-tk-slate transition-colors hover:border-tk-teal hover:text-tk-teal"
                    >
                      In hub
                    </Link>
                    <Link
                      href={`/insights-report/${row.site.slug}?period=${row.period}`}
                      className="rounded-md bg-tk-teal px-2.5 py-1 text-[10.5px] font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90"
                    >
                      View / PDF
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-tk-onyx">Tracked reports</h2>
        {manual.length === 0 ? (
          <p className="mt-3 text-sm text-tk-slate/70">No reports yet.</p>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            {manual.map((report) => {
              const parent = report.retainer
                ? {
                    href: ROUTES.retainer(report.retainer.slug),
                    label: report.retainer.name,
                  }
                : report.project
                  ? {
                      href: ROUTES.project(report.project.slug),
                      label: report.project.name,
                    }
                  : report.client
                    ? {
                        href: ROUTES.client(report.client.slug),
                        label: report.client.name,
                      }
                    : null
              return (
                <li
                  key={report.id}
                  className="flex items-center justify-between gap-4 border-b border-tk-slate/10 px-5 py-3.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-tk-onyx">{report.title}</p>
                    <p className="mt-0.5 text-sm text-tk-slate/70">
                      {parent ? (
                        <Link
                          href={parent.href}
                          className="font-semibold text-tk-teal hover:underline"
                        >
                          {parent.label}
                        </Link>
                      ) : null}
                      {report.periodLabel
                        ? `${parent ? " · " : ""}${report.periodLabel}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {report.cadence !== "none" ? (
                      <Badge>{CADENCE_LABEL[report.cadence]}</Badge>
                    ) : null}
                    <Badge>{REPORT_STATUS_LABEL[report.status]}</Badge>
                    {report.slug && report.bodyPath ? (
                      <a
                        href={ROUTES.reportDoc(report.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-tk-teal px-2.5 py-1 text-[10.5px] font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90"
                      >
                        View
                      </a>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
