import { and, asc, eq, gte, lt } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Timesheet } from "@/components/work/Timesheet"
import { db } from "@/db"
import { clients, invoices, timeEntries } from "@/db/schema"
import {
  currentMonth,
  isMonthKey,
  monthBounds,
} from "@/lib/timesheet"

export const metadata = { title: "Timesheet" }

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: { client?: string; month?: string }
}) {
  const month = isMonthKey(searchParams.month)
    ? searchParams.month
    : currentMonth()

  const accounts = await db.query.clients.findMany({
    orderBy: [asc(clients.name)],
    with: { retainers: true },
  })

  const selected =
    accounts.find((row) => row.slug === searchParams.client) ??
    accounts.find((row) => row.slug === "gdi") ??
    accounts[0]

  const sheetClients = accounts.map((row) => {
    const retainer =
      row.retainers.find((item) => item.status === "active") ??
      row.retainers[0] ??
      null
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      rateCents: retainer?.rateCents ?? null,
      retainerSlug: retainer?.slug ?? null,
    }
  })

  if (!selected) {
    return (
      <>
        <PageHeader title="Timesheet" />
        <p className="mt-8 text-sm text-tk-slate/70">
          Add a client first, then log hours here.
        </p>
      </>
    )
  }

  const client = sheetClients.find((row) => row.id === selected.id)!
  const { start, end } = monthBounds(month)

  const clientProjects = await db.query.projects.findMany({
    where: (p, { eq: e }) => e(p.clientId, selected.id),
    orderBy: (p, { asc: a }) => [a(p.name)],
  })
  const [entries, monthInvoices] = await Promise.all([
    db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.clientId, selected.id),
        gte(timeEntries.occurredOn, start),
        lt(timeEntries.occurredOn, end)
      ),
      orderBy: [asc(timeEntries.occurredOn), asc(timeEntries.createdAt)],
      with: { invoice: true },
    }),
    db.query.invoices.findMany({
      where: and(
        eq(invoices.clientId, selected.id),
        gte(invoices.issuedOn, start),
        lt(invoices.issuedOn, end)
      ),
      orderBy: [asc(invoices.issuedOn)],
    }),
  ])

  const invoiceByNumber = new Map<string, { number: string; status: string }>()
  for (const invoice of monthInvoices) {
    invoiceByNumber.set(invoice.number, {
      number: invoice.number,
      status: invoice.status,
    })
  }
  for (const entry of entries) {
    if (entry.invoice) {
      invoiceByNumber.set(entry.invoice.number, {
        number: entry.invoice.number,
        status: entry.invoice.status,
      })
    }
  }

  return (
    <>
      <PageHeader title="Timesheet" />
      <Timesheet
        key={`${client.slug}-${month}`}
        month={month}
        client={client}
        clients={sheetClients}
        projects={clientProjects.map((p) => ({ id: p.id, name: p.name }))}
        entries={entries.map((entry) => ({
          id: entry.id,
          occurredOn: entry.occurredOn,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
          hours: entry.hours,
          summary: entry.summary,
          projectId: entry.projectId,
          invoiceId: entry.invoiceId,
          invoiceNumber: entry.invoice?.number ?? null,
        }))}
        invoices={Array.from(invoiceByNumber.values())}
      />
    </>
  )
}
