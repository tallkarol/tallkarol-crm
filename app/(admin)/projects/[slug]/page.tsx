import Link from "next/link"
import { notFound } from "next/navigation"
import { asc, eq } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge, projectTone } from "@/components/work/Badge"
import { ContractList } from "@/components/work/ContractList"
import { InvoiceList } from "@/components/work/InvoiceList"
import { Section } from "@/components/work/Section"
import { db } from "@/db"
import { deliverables, projects } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import {
  CADENCE_LABEL,
  DELIVERABLE_STATUS_LABEL,
  FEE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/work"

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}) {
  return { title: params.slug }
}

function deliverableTone(status: keyof typeof DELIVERABLE_STATUS_LABEL) {
  if (status === "paid" || status === "invoiced") return "muted" as const
  if (status === "done") return "teal" as const
  return "neutral" as const
}

export default async function ProjectDetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.slug, params.slug),
    with: {
      client: true,
      retainer: true,
      deliverables: { orderBy: [asc(deliverables.sort)] },
      tasks: true,
      invoices: true,
      contracts: true,
    },
  })

  if (!project) notFound()

  return (
    <>
      <Link
        href={ROUTES.projects}
        className="text-sm font-semibold text-tk-teal hover:underline"
      >
        ← Projects
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={project.name} />
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={projectTone(project.status)}>
            {PROJECT_STATUS_LABEL[project.status]}
          </Badge>
          <Badge>{FEE_STATUS_LABEL[project.feeStatus]}</Badge>
        </div>
      </div>
      <p className="mt-2 text-sm text-tk-slate/70">
        <Link
          href={ROUTES.client(project.client.slug)}
          className="font-semibold text-tk-teal hover:underline"
        >
          {project.client.name}
        </Link>
        {project.retainer ? (
          <>
            {" · "}
            <Link
              href={ROUTES.retainer(project.retainer.slug)}
              className="font-semibold text-tk-teal hover:underline"
            >
              {project.retainer.name}
            </Link>
          </>
        ) : null}
      </p>
      {project.notes ? (
        <p className="mt-3 text-sm text-tk-slate/70">{project.notes}</p>
      ) : null}

      {project.deliverables.length > 0 ? (
      <Section title="Deliverables">
        <ul className="divide-y divide-tk-slate/10">
          {project.deliverables.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5"
            >
              <p className="font-medium text-tk-onyx">
                {item.label}
                {item.title ? (
                  <span className="ml-2 font-normal text-tk-slate/70">
                    {item.title}
                  </span>
                ) : null}
              </p>
              <Badge tone={deliverableTone(item.status)}>
                {DELIVERABLE_STATUS_LABEL[item.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </Section>
      ) : null}

      {project.tasks.length > 0 ? (
      <Section title="Tasks">
        <ul className="divide-y divide-tk-slate/10">
          {project.tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5"
            >
              <div>
                <p className="font-medium text-tk-onyx">{task.title}</p>
                {task.notes ? (
                  <p className="mt-0.5 text-sm text-tk-slate/70">{task.notes}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1.5">
                {task.cadence !== "none" ? (
                  <Badge>{CADENCE_LABEL[task.cadence]}</Badge>
                ) : null}
                <Badge tone={task.status === "open" ? "teal" : "muted"}>
                  {TASK_STATUS_LABEL[task.status]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      ) : null}

      {project.contracts.length > 0 ? (
        <Section title="Contract">
          <ContractList contracts={project.contracts} />
        </Section>
      ) : null}

      {project.invoices.length > 0 ? (
        <Section title="Invoices">
          <InvoiceList invoices={project.invoices} />
        </Section>
      ) : null}
    </>
  )
}
