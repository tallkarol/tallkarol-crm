import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { Badge } from "@/components/work/Badge"
import { ROUTES } from "@/lib/nav"
import { LIST_STATUS_LABEL, SOURCE_KIND_LABEL } from "@/lib/punchlist"
import { listPunchlists, type PunchlistSummary } from "@/lib/punchlists"
import { formatDay } from "@/lib/work"

export const metadata = { title: "Punch lists" }
export const dynamic = "force-dynamic"

const BANDS: { key: PunchlistSummary["effectiveStatus"]; title: string }[] = [
  { key: "open", title: "Open" },
  { key: "draft", title: "Drafts — waiting for an accept" },
  { key: "done", title: "Done" },
  { key: "void", title: "Void" },
]

export default async function PunchlistsPage({
  searchParams,
}: {
  searchParams: { peek?: string }
}) {
  const rows = await listPunchlists()

  return (
    <>
      <PageHeader title="Punch lists" />
      <p className="mt-1 text-xs text-tk-slate/60">
        Checklists an agent cut from an email, a document or a transcript. Every
        item is a task; ticking one here ticks it everywhere.
      </p>

      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.punchlists} />
      ) : null}

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-tk-slate/25 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-tk-onyx">No punch lists yet</p>
          <p className="mt-1 text-sm text-tk-slate/70">
            They are only ever generated — run <code className="rounded bg-tk-linen px-1">/punchlist</code> in a
            session with the source in hand.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          {BANDS.map((band) => {
            const inBand = rows.filter((r) => r.effectiveStatus === band.key)
            if (inBand.length === 0) return null
            return (
              <section key={band.key}>
                <div className="flex items-baseline justify-between px-1 pb-2">
                  <h2 className="text-[12.5px] font-bold text-tk-onyx">{band.title}</h2>
                  <span className="font-mono text-[11px] tabular-nums text-tk-slate/55">{inBand.length}</span>
                </div>
                <ul className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
                  {inBand.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-4 border-b border-tk-slate/10 px-5 py-3.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <Link
                          href={ROUTES.punchlist(row.slug)}
                          className="font-medium text-tk-onyx hover:text-tk-teal hover:underline"
                        >
                          {row.title}
                        </Link>
                        <p className="mt-0.5 text-sm text-tk-slate/70">
                          <Link href={ROUTES.client(row.client.slug)} className="font-semibold text-tk-teal hover:underline">
                            {row.client.name}
                          </Link>
                          {row.project ? (
                            <>
                              {" · "}
                              <Link href={ROUTES.project(row.project.slug)} className="font-semibold text-tk-teal hover:underline">
                                {row.project.name}
                              </Link>
                            </>
                          ) : null}
                          {" · "}
                          {SOURCE_KIND_LABEL[row.sourceKind] ?? row.sourceKind}
                          {row.sourceRef ? `: ${row.sourceRef}` : ""}
                          {" · "}
                          {formatDay(row.createdAt.toISOString().slice(0, 10))}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[11.5px] tabular-nums text-tk-slate/70">
                            {row.progress.done}/{row.progress.total}
                          </span>
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-tk-slate/10" aria-hidden>
                            <span className="block h-full rounded-full bg-tk-teal" style={{ width: `${row.progress.pct}%` }} />
                          </span>
                        </span>
                        {row.testSummary.fail > 0 ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            {row.testSummary.fail} failing
                          </span>
                        ) : null}
                        {row.testSummary.pending > 0 ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            {row.testSummary.pending} test{row.testSummary.pending === 1 ? "" : "s"} waiting
                          </span>
                        ) : null}
                        {row.testSummary.pass > 0 ? <Badge tone="teal">{row.testSummary.pass} passed</Badge> : null}
                        <Badge tone={row.effectiveStatus === "done" ? "muted" : "neutral"}>
                          {LIST_STATUS_LABEL[row.effectiveStatus]}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
