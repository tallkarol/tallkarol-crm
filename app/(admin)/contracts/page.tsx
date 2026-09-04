import { desc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { ContractList } from "@/components/work/ContractList"
import { db } from "@/db"
import { contracts } from "@/db/schema"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Contracts" }

export default async function ContractsPage() {
  const rows = await db.query.contracts.findMany({
    orderBy: [desc(contracts.effectiveOn)],
    with: { client: true },
  })

  return (
    <>
      <PageHeader title="Contracts" />

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink-3">No contracts yet.</p>
      ) : (
        <Card className="mt-8 overflow-hidden">
          <ContractList
            contracts={rows.map((row) => ({
              ...row,
              clientName: row.client.name,
            }))}
          />
        </Card>
      )}
    </>
  )
}
