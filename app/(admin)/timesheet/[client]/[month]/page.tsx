import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { and, asc, eq, gte, lt } from "drizzle-orm"
import { Timesheet } from "@/components/work/Timesheet"
import { db } from "@/db"
import { clients, invoices, timeEntries } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { monthsWithEntries, sheetLock } from "@/lib/sheets"
import { currentMonth, isMonthKey, monthBounds, monthLong } from "@/lib/timesheet"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: { client: string; month: string }
}) {
  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, params.client),
  })
  if (!client || !isMonthKey(params.month)) return { title: "Sheet" }
  return { title: `${client.name} · ${monthLong(params.month)}` }
}

/**
 * One sheet: a client and a month. The grid is unchanged — tab through cells,
 * `3-Aug` dates, hours from start and end — but it now knows whether the month
 * is still open, and shows where each row came from.
 */
export default async function SheetPage({
  params,
}: {
  params: { client: string; month: string }
}) {
  if (!isMonthKey(params.month)) {
    redirect(ROUTES.timesheetFor(params.client, currentMonth()))
  }
  const month = params.month

  const accounts = await db.query.clients.findMany({
    orderBy: [asc(clients.name)],
    with: { retainers: true },
  })

  const selected = accounts.find((row) => row.slug === params.client)
  if (!selected) notFound()

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
      capHours: retainer?.hoursPerMonth ?? null,
    }
  })

  const client = sheetClients.find((row) => row.id === selected.id)!
  const { start, end } = monthBounds(month)

  const clientProjects = await db.query.projects.findMany({
    where: (p, { eq: e }) => e(p.clientId, selected.id),
    orderBy: (p, { asc: a }) => [a(p.name)],
  })

  const [entries, monthInvoices, monthsWithData] = await Promise.all([
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
    monthsWithEntries(selected.id),
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

  const sheetInvoices = Array.from(invoiceByNumber.values())
  const lock = sheetLock(
    sheetInvoices.length > 0
      ? {
          number: sheetInvoices[0].number,
          status: sheetInvoices[0].status as "draft" | "sent" | "paid",
        }
      : null
  )

  return (
    <>
      <Timesheet
        key={`${client.slug}-${month}`}
        month={month}
        client={client}
        clients={sheetClients}
        projects={clientProjects.map((p) => ({ id: p.id, name: p.name }))}
        monthsWithData={monthsWithData}
        lock={{ locked: lock.locked, state: lock.state }}
        entries={entries.map((entry) => ({
          id: entry.id,
          occurredOn: entry.occurredOn,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
          hours: entry.hours,
          summary: entry.summary,
          source: entry.source,
          projectId: entry.projectId,
          invoiceId: entry.invoiceId,
          invoiceNumber: entry.invoice?.number ?? null,
        }))}
        invoices={sheetInvoices}
      />

      <p className="mt-4 text-sm text-tk-slate/55">
        <Link
          href={ROUTES.timesheetSheets}
          className="font-semibold text-tk-teal hover:underline"
        >
          All sheets
        </Link>{" "}
        · every client-month, grouped by what to do next.
      </p>
    </>
  )
}
