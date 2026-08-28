import Link from "next/link"
import { asc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/work/Badge"
import { db } from "@/db"
import { retainers } from "@/db/schema"
import { formatRetainerWindow } from "@/lib/forecast"
import { ROUTES } from "@/lib/nav"
import { RETAINER_STATUS_LABEL, plural } from "@/lib/work"

export const metadata = { title: "Retainers" }

export default async function RetainersPage() {
  const rows = await db.query.retainers.findMany({
    orderBy: [asc(retainers.name)],
    with: {
      client: true,
      projects: true,
      tasks: true,
      reports: true,
    },
  })

  return (
    <>
      <PageHeader title="Retainers" />

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-tk-slate/70">No retainers yet.</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((retainer) => {
            const window = formatRetainerWindow(retainer.startsOn, retainer.endsOn)
            return (
            <li key={retainer.id}>
              <Link
                href={ROUTES.retainer(retainer.slug)}
                className="block rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm transition-colors hover:border-tk-teal/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-tk-onyx">{retainer.name}</p>
                  <Badge tone={retainer.status === "active" ? "teal" : "muted"}>
                    {RETAINER_STATUS_LABEL[retainer.status]}
                  </Badge>
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-tk-onyx">
                  {retainer.hoursPerMonth}
                  <span className="ml-1.5 text-sm font-medium text-tk-slate/70">
                    hr / mo
                  </span>
                </p>
                {window ? (
                  <p className="mt-1 text-xs text-tk-slate/60">{window}</p>
                ) : null}
                <p className="mt-2 text-sm text-tk-slate/70">
                  {plural(retainer.projects.length, "project")}
                  {" · "}
                  {plural(retainer.tasks.length, "task")}
                  {" · "}
                  {plural(retainer.reports.length, "report")}
                </p>
              </Link>
            </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
