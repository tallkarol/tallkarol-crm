import { notFound } from "next/navigation"
import { SystemsAccordion } from "@/components/clients/SystemsAccordion"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { loadMonitorsRoom } from "@/lib/client-monitors"
import { loadClientShell } from "@/lib/client-rooms"
import { ROUTES } from "@/lib/nav"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const client = await loadClientShell(params.slug)
  return { title: client ? `${client.name} · Monitors` : params.slug }
}

/**
 * The Monitors room: one accordion row per system the client has running —
 * a site, an app (with its scheduled-job monitors), or a standalone job.
 * Assembly lives in `lib/client-monitors.ts`; this page only fetches and
 * hands the result to `SystemsAccordion`.
 */
export default async function ClientMonitorsPage(
  props: {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ peek?: string }>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const client = await loadClientShell(params.slug)
  if (!client) notFound()

  const room = await loadMonitorsRoom(client)

  return (
    <>
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.clientRoom(client.slug, "monitors")} />
      ) : null}
      <SystemsAccordion clientName={client.name} systems={room.systems} summary={room.summary} />
    </>
  )
}
