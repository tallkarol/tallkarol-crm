import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { MoneyInput } from "@/components/ui/MoneyInput"
import { Badge } from "@/components/work/Badge"
import { NotesControl, PickButtons } from "@/components/peek/controls"
import { Section } from "@/components/work/Section"
import { TimesheetTable } from "@/components/work/TimesheetTable"
import { db } from "@/db"
import { invoices } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { setInvoiceNotesAction, setInvoiceStatusAction } from "@/lib/peek-actions"
import { updateInvoiceDetails } from "../edit-actions"
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
          <Link
            href={`/invoice-print/${encodeURIComponent(invoice.number)}`}
            className="rounded-full bg-tk-teal px-4 py-1.5 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
          >
            Print / PDF
          </Link>
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
      {invoice.status === "draft" ? (
        <section className="mt-5 max-w-3xl rounded-2xl border border-amber-700/25 bg-amber-700/[0.04] p-5">
          <h2 className="text-sm font-semibold text-tk-onyx">
            Edit draft
            <span className="ml-2 text-xs font-normal text-tk-slate/60">
              review the numbers, then Print / PDF and mark sent
            </span>
          </h2>
          <form action={updateInvoiceDetails.bind(null, invoice.id)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm">
              <span className="text-xs font-medium text-tk-slate/70">Invoice #</span>
              <input name="number" defaultValue={invoice.number} required className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-tk-teal" />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-tk-slate/70">Date</span>
              <input name="issuedOn" type="date" defaultValue={invoice.issuedOn} required className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-white px-3 py-2 text-sm outline-none focus:border-tk-teal" />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-tk-slate/70">Amount ($)</span>
              <MoneyInput name="amount" inputMode="decimal" defaultValue={(invoice.amountCents / 100).toFixed(2)} required className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-tk-teal" />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-tk-slate/70">Hours</span>
              <input name="hours" inputMode="decimal" defaultValue={invoice.hours ?? ""} placeholder="—" className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-tk-teal" />
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-4">
              <span className="text-xs font-medium text-tk-slate/70">Bill to (one line — the client profile supplies the full block)</span>
              <input name="billTo" defaultValue={invoice.billTo} className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-white px-3 py-2 text-sm outline-none focus:border-tk-teal" />
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-4">
              <span className="text-xs font-medium text-tk-slate/70">
                Description — first line is the headline; “- bullet (20%)” lines become table rows with the % in its own column
              </span>
              <textarea name="description" rows={6} defaultValue={invoice.description} className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-tk-teal" />
            </label>
            <div>
              <button className="rounded-lg bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90">
                Save draft
              </button>
            </div>
          </form>
        </section>
      ) : (
        <>
          {invoice.billTo ? (
            <p className="mt-1 text-sm text-tk-slate/70">{invoice.billTo}</p>
          ) : null}
          {invoice.description ? (
            <p className="mt-3 whitespace-pre-line text-sm text-tk-onyx">{invoice.description}</p>
          ) : null}
        </>
      )}
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
