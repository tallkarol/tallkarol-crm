import Link from "next/link"
import { Play } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { TimesheetTabs } from "@/components/timesheet/TimesheetTabs"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { pendingPunchCount, runningPunches } from "@/lib/punches"

export const dynamic = "force-dynamic"

/**
 * One header for the whole timesheet. The running clock is not here: it is the
 * floating pill the admin layout mounts everywhere (`FloatingClock`), so the
 * header only offers a way in when nothing is running.
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
      <PageHeader
        title="Timesheet"
        actions={
          running.length === 0 ? (
            <Link
              href={ROUTES.timesheetLive}
              className="inline-flex items-center gap-1.5 rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
            >
              <Play className="size-3.5" />
              Clock in
            </Link>
          ) : undefined
        }
      />
      <TimesheetTabs pending={pending} />
      {children}
    </>
  )
}
