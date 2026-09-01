import Link from "next/link"
import { asc, desc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/work/Badge"
import { db } from "@/db"
import { worksheets } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { WORKSHEET_MODE_LABEL, WORKSHEET_STATUS_LABEL } from "@/lib/work"

export const metadata = { title: "Worksheets" }
export const dynamic = "force-dynamic"

export default async function WorksheetsPage() {
  const rows = await db.query.worksheets.findMany({
    orderBy: [asc(worksheets.instrument), desc(worksheets.createdAt)],
    with: { client: true, retainer: true, project: true },
  })

  return (
    <>
      <PageHeader title="Worksheets" />
      <p className="mt-1 text-xs text-tk-slate/60">
        Filled-in instruments — the question sets that configure the work before
        it starts. Open answers are what a worksheet is chased for.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-tk-slate/70">No worksheets yet.</p>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
          {rows.map((row) => {
            const parent = row.client
              ? { href: ROUTES.client(row.client.slug), label: row.client.name }
              : null
            const meta = [
              row.instrument
                ? `${row.instrument}${row.version ? ` ${row.version}` : ""}`
                : null,
              WORKSHEET_MODE_LABEL[row.mode],
              row.questionCount ? `${row.questionCount} questions` : null,
              row.filledOn,
            ].filter(Boolean)
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 border-b border-tk-slate/10 px-5 py-3.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-tk-onyx">{row.title}</p>
                  <p className="mt-0.5 text-sm text-tk-slate/70">
                    {parent ? (
                      <Link
                        href={parent.href}
                        className="font-semibold text-tk-teal hover:underline"
                      >
                        {parent.label}
                      </Link>
                    ) : (
                      "No client"
                    )}
                    {meta.length > 0 ? ` · ${meta.join(" · ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {row.internal ? <Badge>Internal</Badge> : null}
                  {row.openCount > 0 ? (
                    <Badge tone="teal">{row.openCount} open</Badge>
                  ) : null}
                  <Badge>{WORKSHEET_STATUS_LABEL[row.status]}</Badge>
                  {row.slug && row.bodyPath ? (
                    <a
                      href={ROUTES.worksheetDoc(row.slug)}
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
    </>
  )
}
