import Link from "next/link"
import { ROUTES } from "@/lib/nav"
import { LIST_STATUS_LABEL, SOURCE_KIND_LABEL } from "@/lib/punchlist"
import type { PunchlistSummary } from "@/lib/punchlists"
import { formatDay } from "@/lib/work"
import { Card } from "@/components/ui/Card"

/** The rows a client hub or project page shows — title, progress, tests. */
export function PunchlistList({
  rows,
  peekBase,
}: {
  rows: PunchlistSummary[]
  peekBase?: string
}) {
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <Link
              href={peekBase ? `${peekBase}?peek=punchlist:${row.slug}` : ROUTES.punchlist(row.slug)}
              scroll={false}
              className="truncate text-[13.5px] font-semibold text-tk-onyx hover:text-tk-teal hover:underline"
            >
              {row.title}
            </Link>
            <p className="mt-0.5 text-xs text-ink-3">
              {[
                row.project ? row.project.name : null,
                SOURCE_KIND_LABEL[row.sourceKind] ?? row.sourceKind,
                LIST_STATUS_LABEL[row.effectiveStatus],
                formatDay(row.createdAt.toISOString().slice(0, 10)),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {row.testSummary.fail > 0 ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                {row.testSummary.fail} failing
              </span>
            ) : null}
            {row.testSummary.pending > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                test waiting
              </span>
            ) : null}
            <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
              {row.progress.done}/{row.progress.total}
            </span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-well" aria-hidden>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${row.progress.pct}%` }} />
            </span>
            <Link
              href={ROUTES.punchlist(row.slug)}
              className="text-[11px] font-semibold text-tk-teal hover:underline"
            >
              Open
            </Link>
          </div>
        </div>
      ))}
    </Card>
  )
}
