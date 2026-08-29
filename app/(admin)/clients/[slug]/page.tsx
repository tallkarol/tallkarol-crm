import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { TaskComposer } from "@/components/tasks/TaskComposer"
import { TaskRows } from "@/components/tasks/TaskRows"
import { Badge, projectTone } from "@/components/work/Badge"
import { ContractList } from "@/components/work/ContractList"
import { InvoiceList } from "@/components/work/InvoiceList"
import { Section } from "@/components/work/Section"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { tasksFor, taskTargets } from "@/lib/tasks"
import { currentMonth } from "@/lib/timesheet"
import {
  FEE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  RETAINER_STATUS_LABEL,
} from "@/lib/work"

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}) {
  return { title: params.slug }
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { peek?: string }
}) {
  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, params.slug),
    with: {
      retainers: true,
      projects: { with: { deliverables: true } },
      invoices: true,
      contracts: true,
    },
  })

  if (!client) notFound()

  // The client page never mentioned tasks — noticing something here meant
  // leaving the page to write it down.
  const [clientTasks, targets] = await Promise.all([
    tasksFor({ clientId: client.id }),
    taskTargets(),
  ])
  const openTasks = clientTasks.filter((t) => t.status === "open")

  return (
    <>
      <Link
        href={ROUTES.clients}
        className="text-sm font-semibold text-tk-teal hover:underline"
      >
        ← Clients
      </Link>
      <div className="mt-4">
        <PageHeader
          title={client.name}
          actions={
            <Link
              href={ROUTES.timesheetFor(client.slug, currentMonth())}
              className="text-sm font-semibold text-tk-teal hover:underline"
            >
              Timesheet
            </Link>
          }
        />
      </div>
      {client.notes ? (
        <p className="mt-2 text-sm text-tk-slate/70">{client.notes}</p>
      ) : null}

      {searchParams.peek ? (
        <PeekRouter
          peek={searchParams.peek}
          closeHref={ROUTES.client(client.slug)}
        />
      ) : null}

      <Section title="Tasks" allowOverflow>
        <div className="mb-3">
          <TaskComposer
            targets={targets}
            scope={{
              clientId: client.id,
              clientName: client.name,
              clientSlug: client.slug,
            }}
            placeholder={`Add a task for ${client.name}…`}
            compact
          />
        </div>
        {openTasks.length === 0 ? (
          <p className="text-sm text-tk-slate/60">
            Nothing open. Anything typed above lands on {client.name}.
          </p>
        ) : (
          <TaskRows
            tasks={openTasks}
            sortBy="due"
            grouping="none"
            peekBase={ROUTES.client(client.slug)}
          />
        )}
      </Section>

      {client.retainers.length > 0 ? (
      <Section title="Retainers">
        <ul className="divide-y divide-tk-slate/10">
          {client.retainers.map((retainer) => (
            <li key={retainer.id}>
              <Link
                href={ROUTES.retainer(retainer.slug)}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-tk-linen/60"
              >
                <p className="font-medium text-tk-onyx">
                  {retainer.name}
                  <span className="ml-2 font-normal text-tk-slate/70">
                    {retainer.hoursPerMonth} hr / mo
                  </span>
                </p>
                <Badge tone={retainer.status === "active" ? "teal" : "muted"}>
                  {RETAINER_STATUS_LABEL[retainer.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      ) : null}

      {client.projects.length > 0 ? (
      <Section title="Projects">
        <ul className="divide-y divide-tk-slate/10">
          {client.projects.map((project) => (
            <li key={project.id}>
              <Link
                href={ROUTES.project(project.slug)}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-tk-linen/60"
              >
                <p className="font-medium text-tk-onyx">{project.name}</p>
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
      </Section>
      ) : null}

      {client.contracts.length > 0 ? (
        <Section title="Contracts">
          <ContractList contracts={client.contracts} />
        </Section>
      ) : null}

      {client.invoices.length > 0 ? (
        <Section title="Invoices">
          <InvoiceList invoices={client.invoices} />
        </Section>
      ) : null}
    </>
  )
}
