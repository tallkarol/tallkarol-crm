import { notFound } from "next/navigation"
import { WeekGrid } from "@/components/clients/WeekGrid"
import { EventLinker } from "@/components/products/EventLinker"
import { isIsoDateString } from "@/lib/client-calendar"
import { isoDay } from "@/lib/client-rooms"
import { ROUTES } from "@/lib/nav"
import { loadProductShell, loadProductWeek } from "@/lib/product-rooms"
import { workspaceTimezone } from "@/lib/timezone"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const product = await loadProductShell(params.slug)
  return { title: product ? `${product.name} · Calendar` : params.slug }
}

/**
 * The product's Calendar room: the client Calendar's week grid, this
 * product's events in its colour and its tasks on the Due row, and under it
 * the week's events to file onto the product. `?week=` pages the window.
 */
export default async function ProductCalendarPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { week?: string }
}) {
  const product = await loadProductShell(params.slug)
  if (!product) notFound()
  const now = new Date()
  const anchor = isIsoDateString(searchParams.week) ? searchParams.week : undefined
  const [{ week, linkable }, tz] = await Promise.all([loadProductWeek(product, now, anchor), workspaceTimezone()])
  // Labels are made here, in the workspace's zone, so server and browser render the same text.
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
  const when = (startsAt: string, allDay: boolean) =>
    `${day.format(new Date(startsAt))} · ${allDay ? "all day" : time.format(new Date(startsAt))}`
  const mine = week.items.flatMap((i) =>
    i.kind === "event" && i.mine ? [{ id: i.id, title: i.title, when: when(i.startsAt, i.allDay) }] : []
  )
  const unfiled = linkable.map((e) => ({ id: e.id, title: e.title, when: when(e.startsAt, e.allDay), client: e.client }))

  return (
    <div className="flex flex-col gap-3">
      <WeekGrid
        client={{ slug: product.slug, name: product.name, color: product.color }}
        week={week}
        today={isoDay(now)}
        base={ROUTES.productRoom(product.slug, "calendar")}
      />
      <EventLinker productId={product.id} productName={product.name} mine={mine} linkable={unfiled} />
    </div>
  )
}
