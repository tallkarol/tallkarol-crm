import { PageHeader } from "@/components/PageHeader"
import { LiveIndicator } from "@/components/timesheet/LiveIndicator"
import { TimesheetTabs } from "@/components/timesheet/TimesheetTabs"
import { getSessionUser } from "@/lib/auth"
import { pendingPunchCount, runningPunches } from "@/lib/punches"

export const dynamic = "force-dynamic"

/**
 * One header for the whole timesheet. The running clock lives here so it is on
 * screen — and stoppable — from every view underneath.
 */
export default async function TimesheetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  const [running, pending] = user
    ? await Promise.all([runningPunches(user.id), pendingPunchCount(user.id)])
    : [[], 0]

  return (
    <>
      <PageHeader title="Timesheet" actions={<LiveIndicator running={running} />} />
      <TimesheetTabs pending={pending} />
      {children}
    </>
  )
}
