import { notFound } from "next/navigation"
import { SupportConsole } from "@/components/support/SupportConsole"
import { SupportHeader } from "@/components/support/SupportHeader"
import { TicketDetail, type DetailTab } from "@/components/support/TicketDetail"
import { db } from "@/db"
import { getSmartsheetConfig, smartsheetTokenPresent } from "@/lib/smartsheet"
import {
  loadQueue,
  loadTicket,
  parseQueueParams,
  queueQueryString,
  type SearchParams,
} from "../data"

export const dynamic = "force-dynamic"

const TABS: DetailTab[] = ["thread", "payload", "env", "related"]

export async function generateMetadata({ params }: { params: { number: string } }) {
  return { title: `Ticket ${decodeURIComponent(params.number).toUpperCase()}` }
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: { number: string }
  searchParams: SearchParams
}) {
  const slug = decodeURIComponent(params.number).toUpperCase()

  const [queue, clients, config] = await Promise.all([
    loadQueue(),
    db.query.clients.findMany({
      columns: { id: true, name: true, slug: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    getSmartsheetConfig(),
  ])

  const id = queue.bySlug.get(slug)
  if (!id) notFound()

  const detail = await loadTicket(id)
  if (!detail) notFound()

  const tabParam = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab
  const tab = TABS.includes(tabParam as DetailTab) ? (tabParam as DetailTab) : "thread"
  const query = queueQueryString(searchParams)

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
        selected={slug}
        query={query}
        detail={
          <TicketDetail
            ticket={detail.ticket}
            messages={detail.messages}
            payloads={detail.payloads}
            attachments={detail.attachments}
            triggeredBy={detail.triggeredBy}
            related={detail.related}
            tab={tab}
            query={query}
            knownPlatforms={queue.platforms}
            appUrl={process.env.APP_URL || "https://crm.tallkarol.com"}
          />
        }
      />
    </>
  )
}
