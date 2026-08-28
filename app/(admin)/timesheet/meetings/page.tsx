import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { MeetingInbox } from "@/components/timesheet/MeetingInbox"
import { meetingProposals, unmatchedDomains } from "@/lib/meetings"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Meetings" }
export const dynamic = "force-dynamic"

export default async function MeetingsPage() {
  const [proposals, unmatched] = await Promise.all([
    meetingProposals(),
    unmatchedDomains(),
  ])

  return (
    <>
      <PageHeader
        title="Meetings"
        actions={
          <Link
            href={ROUTES.timesheet}
            className="rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
          >
            Timesheet
          </Link>
        }
      />
      <p className="mt-2 max-w-2xl text-sm text-tk-slate/70">
        Meetings from the last 60 days whose guests match a client domain, and
        that are not on the timesheet yet. Logging one writes a real time entry.
      </p>
      <MeetingInbox proposals={proposals} unmatched={unmatched} />
    </>
  )
}
