import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge, projectTone } from "@/components/work/Badge"
import { InvoiceList } from "@/components/work/InvoiceList"
import { Section } from "@/components/work/Section"
import { TimesheetTable } from "@/components/work/TimesheetTable"
import { db } from "@/db"
import { retainers } from "@/db/schema"
import { formatRetainerWindow } from "@/lib/forecast"
import { ROUTES } from "@/lib/nav"
import { currentMonth } from "@/lib/timesheet"
import {
  CADENCE_LABEL,
  FEE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  REPORT_STATUS_LABEL,
  RETAINER_STATUS_LABEL,
  TASK_STATUS_LABEL,
  formatHours,
  formatMoney,
  hoursTotal,
} from "@/lib/work"

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}) {
  return { title: params.slug }
}

export default async function RetainerDetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const retainer = await db.query.retainers.findFirst({
    where: eq(retainers.slug, params.slug),
    with: {
      client: true,
      projects: true,
      tasks: true,
      reports: true,
      invoices: true,
      timeEntries: true,
    },
  })

  if (!retainer) notFound()

  const window = formatRetainerWindow(retainer.startsOn, retainer.endsOn)

  return (
    <>
      <Link
        href={ROUTES.retainers}
        className="text-sm font-semibold text-tk-teal hover:underline"
      >
        ← Retainers
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={retainer.name} />
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={retainer.status === "active" ? "teal" : "muted"}>
            {RETAINER_STATUS_LABEL[retainer.status]}
          </Badge>
          <Badge>{retainer.hoursPerMonth} hr / mo</Badge>
          {retainer.rateCents ? (
            <Badge>{formatMoney(retainer.rateCents)} / hr</Badge>
          ) : null}
          {window ? <Badge>{window}</Badge> : null}
        </div>
      </div>
      <p className="mt-2 text-sm text-tk-slate/70">
        <Link
          href={ROUTES.client(retainer.client.slug)}
          className="font-semibold text-tk-teal hover:underline"
        >
          {retainer.client.name}
        </Link>
        {" · "}
        <Link
          href={ROUTES.timesheetFor(retainer.client.slug, currentMonth())}
          className="font-semibold text-tk-teal hover:underline"
        >
          Timesheet
        </Link>
      </p>
      {retainer.notes ? (
        <p className="mt-2 max-w-2xl text-sm text-tk-slate/70">{retainer.notes}</p>
      ) : null}
      {retainer.timeEntries.length > 0 ? (
        <p className="mt-2 text-sm text-tk-slate/70">
          {formatHours(hoursTotal(retainer.timeEntries))} logged
          {` · ${retainer.hoursPerMonth} hr bank`}
        </p>
      ) : null}

      {retainer.invoices.length > 0 ? (
        <Section title="Invoices">
          <InvoiceList invoices={retainer.invoices} />
        </Section>
      ) : null}

      {retainer.timeEntries.length > 0 ? (
        <Section title="Work Summary">
          <TimesheetTable entries={retainer.timeEntries} />
        </Section>
      ) : null}

      <Section title="Projects" empty={retainer.projects.length === 0}>
        <ul className="divide-y divide-tk-slate/10">
          {retainer.projects.map((project) => (
            <li key={project.id}>
              <Link
                href={ROUTES.project(project.slug)}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-tk-linen/60"
              >
                <p className="font-medium text-tk-onyx">{project.name}</p>
                <div className="flex shrink-0 gap-1.5">
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

      <Section title="Repeat tasks" empty={retainer.tasks.length === 0}>
        <ul className="divide-y divide-tk-slate/10">
          {retainer.tasks.map((task) => (
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
                <Badge>{CADENCE_LABEL[task.cadence]}</Badge>
                <Badge tone={task.status === "open" ? "teal" : "muted"}>
                  {TASK_STATUS_LABEL[task.status]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Reports" empty={retainer.reports.length === 0}>
        <ul className="divide-y divide-tk-slate/10">
          {retainer.reports.map((report) => (
            <li
              key={report.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5"
            >
              <div>
                <p className="font-medium text-tk-onyx">{report.title}</p>
                {report.periodLabel ? (
                  <p className="mt-0.5 text-sm text-tk-slate/70">
                    {report.periodLabel}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Badge>{CADENCE_LABEL[report.cadence]}</Badge>
                <Badge>{REPORT_STATUS_LABEL[report.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
