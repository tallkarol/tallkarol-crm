import { desc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { InvoicesHub } from "@/components/work/InvoicesHub"
import { db } from "@/db"
import { invoices } from "@/db/schema"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Invoices" }

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { peek?: string }
}) {
  const rows = await db.query.invoices.findMany({
    orderBy: [desc(invoices.issuedOn)],
    with: { client: true },
  })

  return (
    <>
      <PageHeader title="Invoices" />
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.invoices} />
      ) : null}
      <InvoicesHub
        invoices={rows.map((row) => ({
          id: row.id,
          number: row.number,
          clientName: row.client.name,
          clientSlug: row.client.slug,
          issuedOn: row.issuedOn,
          amountCents: row.amountCents,
          hours: row.hours,
          currency: row.currency,
          status: row.status,
          description: row.description,
        }))}
      />
    </>
  )
}
