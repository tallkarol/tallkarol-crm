import { cookies } from "next/headers"
import { ClientComposer } from "@/components/clients/ClientComposer"
import { ClientsPanelMount } from "@/components/clients/ClientsPanel"
import { SignalsCard } from "@/components/clients/SignalsCard"
import { WeekAgenda } from "@/components/clients/WeekGrid"
import { GlobalFocus } from "@/components/focus/GlobalFocus"
import { isIsoDateString } from "@/lib/client-calendar"
import { groupClients } from "@/lib/client-groups"
import { loadClientRoster } from "@/lib/client-hub"
import { isoDay, loadSignalsAll, loadWeekAll } from "@/lib/client-rooms"
import { FOCUS_MODE_COOKIE, isFocusMode } from "@/lib/focus"
import { globalFocus } from "@/lib/focus-data"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Clients" }
export const dynamic = "force-dynamic"

/**
 * The clients overview. The client list itself is the panel beside the dock
 * (grouped, `ClientsPanel`); the page is the across-clients desk with no
 * title of its own: the global focus set on top ("New client" rides in its
 * header row), then this week (every client, each in its colour) beside
 * everything that needs you.
 */
export default async function ClientsPage({ searchParams }: { searchParams: { week?: string } }) {
  const now = new Date()
  const modeRaw = cookies().get(FOCUS_MODE_COOKIE)?.value
  const mode = isFocusMode(modeRaw) ? modeRaw : "three"
  const anchor = isIsoDateString(searchParams.week) ? searchParams.week : undefined

  const [{ rows }, cards, week, signals] = await Promise.all([
    loadClientRoster(now),
    globalFocus(now),
    loadWeekAll(now, anchor),
    loadSignalsAll(now),
  ])

  return (
    <>
      <ClientsPanelMount groups={groupClients(rows)} />
      <div className="flex flex-col gap-6">
        <GlobalFocus cards={cards} mode={mode} always actions={<ClientComposer />} />
        <div className="grid gap-4 lg:grid-cols-2">
          <WeekAgenda week={week} today={isoDay(now)} nav={{ base: ROUTES.clients }} />
          <SignalsCard signals={signals} max={14} stretch />
        </div>
      </div>
    </>
  )
}
