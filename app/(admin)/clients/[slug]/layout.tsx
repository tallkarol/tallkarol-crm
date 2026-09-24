import { notFound } from "next/navigation"
import { cookies } from "next/headers"
import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { sites } from "@/db/schema"
import { ClientHeader } from "@/components/clients/ClientHeader"
import { ClientPanelMount } from "@/components/clients/ClientPanelMount"
import { FocusStrip } from "@/components/clients/FocusStrip"
import { loadClientPanel, loadClientShell } from "@/lib/client-rooms"
import { FOCUS_MODE_COOKIE, isFocusMode, windowOf } from "@/lib/focus"
import { focusFor } from "@/lib/focus-data"

/**
 * Everything inside one client: the panel swaps into client mode, the header
 * names the client, the room scrolls on its own, and the focus strip docks
 * under it on every room but the Board.
 */
export default async function ClientLayout(
  props: {
    params: Promise<{ slug: string }>
    children: React.ReactNode
  }
) {
  const params = await props.params

  const {
    children
  } = props

  const client = await loadClientShell(params.slug)
  if (!client) notFound()
  const modeRaw = (await cookies()).get(FOCUS_MODE_COOKIE)?.value
  const mode = isFocusMode(modeRaw) ? modeRaw : "three"

  const [panel, focus, site] = await Promise.all([
    loadClientPanel(client),
    focusFor(client),
    db.query.sites.findFirst({ where: eq(sites.clientId, client.id), orderBy: [asc(sites.sort)], columns: { slug: true } }),
  ])
  const { showing, queue } = windowOf(focus.cards, mode)

  return (
    <>
      <ClientPanelMount client={client} data={panel} />
      <div className="flex min-h-0 flex-1 flex-col">
        <ClientHeader client={client} siteSlug={site?.slug ?? null} />
        <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-5">{children}</div>
        <FocusStrip cards={showing} queued={queue.length} client={client} />
      </div>
    </>
  )
}
