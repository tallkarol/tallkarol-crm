import { notFound } from "next/navigation"
import { WeekGrid } from "@/components/clients/WeekGrid"
import { isIsoDateString } from "@/lib/client-calendar"
import { isoDay, loadClientShell, loadWeek } from "@/lib/client-rooms"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const client = await loadClientShell(params.slug)
  return { title: client ? `${client.name} · Calendar` : params.slug }
}

/**
 * The Calendar room: a Mon–Sun hour grid with an all-day Due row, this
 * client's own events in its colour, everyone else's dimmed, and Karol's
 * personal blocks dashed teal — plus a "this week" agenda beside it.
 * `?week=` (any day in the target week) moves the window; the layout, panel
 * and focus strip already work here. Signed off 23 Sep 2026 from
 * `~/Work/tallkarol/crm-hub-b-rooms.html`.
 */
export default async function ClientCalendarPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { week?: string }
}) {
  const client = await loadClientShell(params.slug)
  if (!client) notFound()

  const now = new Date()
  const anchor = isIsoDateString(searchParams.week) ? searchParams.week : undefined
  const week = await loadWeek(client, now, anchor)

  return <WeekGrid client={client} week={week} today={isoDay(now)} />
}
