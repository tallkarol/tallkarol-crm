import Link from "next/link"
import { asc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge, projectTone } from "@/components/work/Badge"
import { db } from "@/db"
import { projects, type ProjectStatus } from "@/db/schema"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import {
  FEE_STATUS_LABEL,
  PROJECT_FILTERS,
  PROJECT_STATUS_LABEL,
} from "@/lib/work"

export const metadata = { title: "Projects" }

function isStatus(value: string | undefined): value is ProjectStatus {
  return (
    value === "waiting_on_content" ||
    value === "in_progress" ||
    value === "complete"
  )
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const status = isStatus(searchParams.status) ? searchParams.status : "all"
  const rows = await db.query.projects.findMany({
    orderBy: [asc(projects.name)],
    with: {
      client: true,
      retainer: true,
      deliverables: true,
    },
  })
  const visible =
    status === "all" ? rows : rows.filter((row) => row.status === status)

  return (
    <>
      <PageHeader title="Projects" />

      <div className="mt-8 flex flex-wrap gap-2">
        {PROJECT_FILTERS.map((item) => {
          const href =
            item.id === "all"
              ? ROUTES.projects
              : `${ROUTES.projects}?status=${item.id}`
          const active = item.id === status
          const count =
            item.id === "all"
              ? rows.length
              : rows.filter((row) => row.status === item.id).length
          return (
            <Link
              key={item.id}
              href={href}
              className={
                active
                  ? "rounded-full bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen"
                  : "rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
              }
            >
              {item.label}
              <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
            </Link>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-tk-slate/70">Nothing in this view.</p>
      ) : (
        <ul className="mt-6 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
          {visible.map((project) => (
            <li
              key={project.id}
              className="border-b border-tk-slate/10 last:border-0"
            >
              <Link
                href={ROUTES.project(project.slug)}
                className={cn(
                  "flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-tk-linen/60"
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium text-tk-onyx">{project.name}</p>
                  <p className="mt-0.5 text-sm text-tk-slate/70">
                    {project.client.name}
                    {project.retainer
                      ? ` · ${project.retainer.name} retainer`
                      : ""}
                    {project.deliverables.length
                      ? ` · ${project.deliverables.filter((d) => d.status === "paid" || d.status === "done" || d.status === "invoiced").length}/${project.deliverables.length} deliverables`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <Badge tone={projectTone(project.status)}>
                    {PROJECT_STATUS_LABEL[project.status]}
                  </Badge>
                  <Badge>{FEE_STATUS_LABEL[project.feeStatus]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
