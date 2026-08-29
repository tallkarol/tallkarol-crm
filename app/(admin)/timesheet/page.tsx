import { redirect } from "next/navigation"
import { ClockPanel } from "@/components/timesheet/ClockPanel"
import { DashboardBoard } from "@/components/timesheet/DashboardBoard"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { punchTargets, runningPunch, todayTotals } from "@/lib/punches"
import { isMonthKey } from "@/lib/timesheet"
import { timesheetDashboard } from "@/lib/timesheet-dashboard"

export const metadata = { title: "Timesheet" }
export const dynamic = "force-dynamic"

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: { client?: string; month?: string }
}) {
  // The sheet used to be a query string. Keep old links and bookmarks working.
  if (searchParams.client) {
    const month = isMonthKey(searchParams.month)
      ? searchParams.month
      : new Date().toISOString().slice(0, 7)
    redirect(ROUTES.timesheetFor(searchParams.client, month))
  }

  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [data, running, targets, today] = await Promise.all([
    timesheetDashboard(user.id),
    runningPunch(user.id),
    punchTargets(user.id),
    todayTotals(user.id),
  ])

  return (
    <>
      <div className="mt-6">
        <ClockPanel running={running} targets={targets} today={today} compact />
      </div>
      <DashboardBoard data={data} />
    </>
  )
}
