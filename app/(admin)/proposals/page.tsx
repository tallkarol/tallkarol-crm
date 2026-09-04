import Link from "next/link"
import { asc, desc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/work/Badge"
import { db } from "@/db"
import { proposals } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { PROPOSAL_STATUS_LABEL } from "@/lib/work"

export const metadata = { title: "Proposals" }
export const dynamic = "force-dynamic"

export default async function ProposalsPage() {
  const rows = await db.query.proposals.findMany({
    orderBy: [asc(proposals.series), asc(proposals.seriesPart), desc(proposals.createdAt)],
    with: { client: true, retainer: true },
  })

  return (
    <>
      <PageHeader title="Proposals" />

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink-3">No proposals yet.</p>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
          {rows.map((row) => {
            const part =
              row.seriesPart && row.seriesOf
                ? `${row.series} · ${row.seriesPart} of ${row.seriesOf}`
                : row.series || null
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-tk-onyx">{row.title}</p>
                  <p className="mt-0.5 text-sm text-ink-3">
                    {row.client ? (
                      <Link
                        href={ROUTES.client(row.client.slug)}
                        className="font-semibold text-tk-teal hover:underline"
                      >
                        {row.client.name}
                      </Link>
                    ) : (
                      "No client"
                    )}
                    {part ? ` · ${part}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge>{PROPOSAL_STATUS_LABEL[row.status]}</Badge>
                  {row.slug && row.bodyPath ? (
                    <a
                      href={ROUTES.proposalDoc(row.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-accent px-2.5 py-1 text-[10.5px] font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90"
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
    </>
  )
}
