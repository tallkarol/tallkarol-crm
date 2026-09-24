import { cookies } from "next/headers"
import { ClientComposer } from "@/components/clients/ClientComposer"
import { SignalsCard } from "@/components/clients/SignalsCard"
import { WeekAgenda } from "@/components/clients/WeekGrid"
import { GlobalFocus } from "@/components/focus/GlobalFocus"
import { isIsoDateString } from "@/lib/client-calendar"
import { isoDay, loadSignalsAll, loadWeekAll } from "@/lib/client-rooms"
import { FOCUS_MODE_COOKIE, isFocusMode } from "@/lib/focus"
import { globalFocus } from "@/lib/focus-data"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Clients" }
export const dynamic = "force-dynamic"

/**
 * The clients overview. The client list itself is the panel beside the dock
 * (grouped, `ClientsPanel` — the Clients group's panel, which the admin
 * layout loads, so this page mounts nothing into the dock); the page is the
 * across-clients desk with no title of its own: the global focus set on top ("New client" rides in its
 * header row), then this week (every client, each in its colour) beside
 * everything that needs you.
 */
export default async function ClientsPage(props: { searchParams: Promise<{ week?: string }> }) {
  const searchParams = await props.searchParams
  const now = new Date()
  const modeRaw = (await cookies()).get(FOCUS_MODE_COOKIE)?.value
  const mode = isFocusMode(modeRaw) ? modeRaw : "three"
  const anchor = isIsoDateString(searchParams.week) ? searchParams.week : undefined

  const [cards, week, signals] = await Promise.all([
    globalFocus(now),
    loadWeekAll(now, anchor),
    loadSignalsAll(now),
  ])

  return (
    <>
      {/* No title row here, so while the floating clock rests top-right the
          page steps down under it rather than hiding the Focus controls. */}
      <div className="flex flex-col gap-6 md:[[data-tk-clock]_&]:pt-8">
        <GlobalFocus cards={cards} mode={mode} actions={<ClientComposer />} />
        <div className="grid gap-4 lg:grid-cols-2">
          <WeekAgenda week={week} today={isoDay(now)} nav={{ base: ROUTES.clients }} />
          <SignalsCard signals={signals} max={14} stretch />
        </div>
      </div>
    </>
  )
}
