import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/work/Badge"
import { NotesControl, PickButtons } from "@/components/peek/controls"
import { Section } from "@/components/work/Section"
import { TimesheetTable } from "@/components/work/TimesheetTable"
import { db } from "@/db"
import { invoices } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { setInvoiceNotesAction, setInvoiceStatusAction } from "@/lib/peek-actions"
import { formatDay, formatHours, formatMoney } from "@/lib/work"

export async function generateMetadata({
  params,
}: {
  params: { number: string }
}) {
  return { title: `Invoice ${params.number}` }
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: { number: string }
}) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.number, params.number),
    with: {
      client: true,
      retainer: true,
      project: true,
      deliverable: true,
      timeEntries: true,
    },
  })

  if (!invoice) notFound()

  const sessions = [...invoice.timeEntries].sort((a, b) =>
    a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0
  )

  return (
    <>
      <Link
        href={ROUTES.invoices}
        className="text-sm font-semibold text-tk-teal hover:underline"
      >
        ← Invoices
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={invoice.number} />
        <div className="flex flex-wrap items-center gap-3">
          <PickButtons
            current={invoice.status}
            action={setInvoiceStatusAction.bind(null, invoice.id) as (v: string) => Promise<{ ok: boolean; error?: string }>}
            options={[
              { value: "draft", label: "Draft", tone: "neutral" },
              { value: "sent", label: "Sent", tone: "neutral" },
              { value: "paid", label: "Paid" },
            ]}
          />
          <Badge>
            {formatMoney(invoice.amountCents, invoice.currency)}
          </Badge>
          {invoice.hours ? <Badge>{formatHours(invoice.hours)}</Badge> : null}
        </div>
      </div>
      <p className="mt-2 text-sm text-tk-slate/70">
        <Link
          href={ROUTES.client(invoice.client.slug)}
          className="font-semibold text-tk-teal hover:underline"
        >
          {invoice.client.name}
        </Link>
        {invoice.retainer ? (
          <>
            {" · "}
            <Link
              href={ROUTES.retainer(invoice.retainer.slug)}
              className="font-semibold text-tk-teal hover:underline"
            >
              {invoice.retainer.name}
            </Link>
          </>
        ) : null}
        {invoice.project ? (
          <>
            {" · "}
            <Link
              href={ROUTES.project(invoice.project.slug)}
              className="font-semibold text-tk-teal hover:underline"
            >
              {invoice.project.name}
            </Link>
          </>
        ) : null}
        {` · ${formatDay(invoice.issuedOn)}`}
        {` · `}
        <Link
          href={ROUTES.timesheetFor(
            invoice.client.slug,
            invoice.issuedOn.slice(0, 7)
          )}
          className="font-semibold text-tk-teal hover:underline"
        >
          Timesheet
        </Link>
      </p>
      {invoice.billTo ? (
        <p className="mt-1 text-sm text-tk-slate/70">{invoice.billTo}</p>
      ) : null}
      {invoice.description ? (
        <p className="mt-3 text-sm text-tk-onyx">{invoice.description}</p>
      ) : null}
      <div className="mt-3 max-w-xl">
        <NotesControl
          value={invoice.notes}
          action={setInvoiceNotesAction.bind(null, invoice.id)}
          placeholder="Payment chasing, context, anything future-you needs…"
          rows={2}
        />
      </div>

      {invoice.deliverable ? (
        <p className="mt-3 text-sm text-tk-slate/70">
          {invoice.deliverable.label}
          {invoice.deliverable.title
            ? ` · ${invoice.deliverable.title}`
            : ""}
        </p>
      ) : null}

      {sessions.length > 0 ? (
        <Section title="Work Summary">
          <TimesheetTable entries={sessions} />
        </Section>
      ) : null}
    </>
  )
}
