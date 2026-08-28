import { PageHeader } from "@/components/PageHeader"
import { SourceManager } from "@/components/calendar/SourceManager"
import { getCalendarSnapshot } from "@/lib/calendar"
import { currentMonth } from "@/lib/timesheet"

export const metadata = { title: "Calendar integrations" }
export const dynamic = "force-dynamic"

export default async function CalendarIntegrationsPage() {
  const snapshot = await getCalendarSnapshot(currentMonth())
  return (
    <>
      <PageHeader title="Calendar" />
      <SourceManager snapshot={snapshot} />
    </>
  )
}
