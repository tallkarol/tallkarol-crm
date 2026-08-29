import { SupportConsole } from "@/components/support/SupportConsole"
import { SupportHeader } from "@/components/support/SupportHeader"
import { db } from "@/db"
import { getSmartsheetConfig, smartsheetTokenPresent } from "@/lib/smartsheet"
import { loadQueue, parseQueueParams, queueQueryString, type SearchParams } from "./data"

export const metadata = { title: "Support" }
export const dynamic = "force-dynamic"

export default async function SupportPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const [queue, clients, config] = await Promise.all([
    loadQueue(),
    db.query.clients.findMany({
      columns: { id: true, name: true, slug: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    getSmartsheetConfig(),
  ])

  return (
    <>
      <SupportHeader
        config={config}
        tokenPresent={smartsheetTokenPresent()}
        clients={clients}
        ticketCount={queue.rows.length}
        appUrl={process.env.APP_URL || "https://crm.tallkarol.com"}
      />
      <SupportConsole
        rows={queue.rows}
        initial={parseQueueParams(searchParams)}
        selected={null}
        query={queueQueryString(searchParams)}
        detail={null}
      />
    </>
  )
}
