import Link from "next/link"
import { CalendarBoard } from "@/components/calendar/CalendarBoard"
import { PageHeader } from "@/components/PageHeader"
import { getCalendarSnapshot } from "@/lib/calendar"
import { ROUTES } from "@/lib/nav"
import { currentMonth, isMonthKey, monthLong, shiftMonth } from "@/lib/timesheet"

export const metadata = { title: "Calendar" }
export const dynamic = "force-dynamic"

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const month = isMonthKey(searchParams.month)
    ? searchParams.month
    : currentMonth()
  const snapshot = await getCalendarSnapshot(month)

  return (
    <>
      <PageHeader
        title="Calendar"
        actions={
          <Link
            href={ROUTES.settingsCalendar}
            className="rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
          >
            Calendars
          </Link>
        }
      />

      {snapshot.sources.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-tk-onyx">
            No calendars connected
          </p>
          <p className="mt-1 max-w-xl text-sm text-tk-slate/70">
            Connect Cal.com and your Google calendars in{" "}
            <Link
              href={ROUTES.settingsCalendar}
              className="font-semibold text-tk-teal hover:underline"
            >
              Settings → Integrations → Calendar
            </Link>
            . Invoices, contracts, and logged time show up below either way.
          </p>
        </div>
      ) : null}

      <CalendarBoard
        snapshot={snapshot}
        prevMonth={shiftMonth(month, -1)}
        nextMonth={shiftMonth(month, 1)}
        thisMonth={currentMonth()}
        monthLabel={monthLong(month)}
      />
    </>
  )
}
