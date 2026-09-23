import { notFound } from "next/navigation"
import { InboxRoom } from "@/components/clients/InboxRoom"
import { isRoomKind, isRoomLens, loadClientInboxRoom } from "@/lib/client-inbox"
import { loadClientShell } from "@/lib/client-rooms"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const client = await loadClientShell(params.slug)
  return { title: client ? `${client.name} · Inbox` : params.slug }
}

/**
 * The Inbox room: this client's slice of the shared inbox, plus parked agent
 * approvals and proposed meeting-note items. Signed off 23 Sep 2026 from
 * `~/Work/tallkarol/hub-mockup-src` (`renderInboxList()` / `renderReading()`).
 */
export default async function ClientInboxPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { lens?: string; kind?: string; item?: string }
}) {
  const client = await loadClientShell(params.slug)
  if (!client) notFound()

  const lens = isRoomLens(searchParams.lens) ? searchParams.lens : "needs"
  const kind = isRoomKind(searchParams.kind) ? searchParams.kind : null
  const itemKey = searchParams.item ?? null

  const data = await loadClientInboxRoom(client, { lens, kind, itemKey })

  return <InboxRoom client={client} data={data} />
}
