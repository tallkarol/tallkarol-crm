import Link from "next/link"
import { redirect } from "next/navigation"
import { asc, ne } from "drizzle-orm"
import { DomainTriage } from "@/components/timesheet/DomainTriage"
import { MeetingInbox } from "@/components/timesheet/MeetingInbox"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { PunchQueue } from "@/components/timesheet/PunchQueue"
import { db } from "@/db"
import { clients, projects } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { cn } from "@/lib/cn"
import { meetingProposals, unmatchedDomains } from "@/lib/meetings"
import { pendingPunches } from "@/lib/punches"

export const metadata = { title: "Review" }
export const dynamic = "force-dynamic"

/**
 * The approval gate. Clock-outs and matched meetings both land here, because
 * they are the same decision: is this hour billable, and what does it say?
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: { tab?: string; peek?: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const tab = searchParams.tab === "meetings" ? "meetings" : "punches"
  const closeHref = tab === "meetings" ? "/timesheet/review?tab=meetings" : "/timesheet/review"

  const [punches, proposals] = await Promise.all([
    pendingPunches(user.id),
    meetingProposals(),
  ])

  return (
    <>
      {searchParams.peek ? <PeekRouter peek={searchParams.peek} closeHref={closeHref} /> : null}
      <nav
        aria-label="Review queues"
        className="mt-5 flex flex-wrap gap-2"
      >
        <TabLink href="/timesheet/review" active={tab === "punches"} count={punches.length}>
          Punches
        </TabLink>
        <TabLink
          href="/timesheet/review?tab=meetings"
          active={tab === "meetings"}
          count={proposals.length}
        >
          Meetings
        </TabLink>
      </nav>

      {tab === "punches" ? (
        <PunchesTab punches={punches} />
      ) : (
        <MeetingsTab proposals={proposals} />
      )}
    </>
  )
}

async function PunchesTab({
  punches,
}: {
  punches: Awaited<ReturnType<typeof pendingPunches>>
}) {
  const openProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(ne(projects.status, "complete"))
    .orderBy(asc(projects.name))

  return (
    <>
      <p className="mt-4 max-w-2xl text-sm text-tk-slate/70">
        Clock-outs waiting to become billable time. Hours bill exactly as
        measured, to two decimals. A punch with no project needs a summary — the
        line has to explain itself on the invoice.
      </p>
      <PunchQueue punches={punches} projects={openProjects} />
    </>
  )
}

async function MeetingsTab({
  proposals,
}: {
  proposals: Awaited<ReturnType<typeof meetingProposals>>
}) {
  const [unmatched, clientRows] = await Promise.all([
    // Mapping a domain is a one-off decision, so look back further than the
    // 60-day window used for proposing entries.
    unmatchedDomains(365),
    db.query.clients.findMany({ orderBy: [asc(clients.name)] }),
  ])

  return (
    <>
      <p className="mt-4 max-w-2xl text-sm text-tk-slate/70">
        Meetings from the last 60 days whose guests match a client domain, and
        that are not on the timesheet yet. Logging one writes a real time entry.
      </p>
      <MeetingInbox proposals={proposals} />
      <DomainTriage
        rows={unmatched}
        clients={clientRows.map((c) => ({ slug: c.slug, name: c.name }))}
      />
    </>
  )
}

function TabLink({
  href,
  active,
  count,
  children,
}: {
  href: string
  active: boolean
  count: number
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-tk-teal bg-tk-teal text-tk-linen"
          : "border-tk-slate/20 bg-white text-tk-slate hover:border-tk-teal hover:text-tk-teal"
      )}
    >
      {children}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
          active ? "bg-tk-linen/25 text-tk-linen" : "bg-tk-linen text-tk-slate/70"
        )}
      >
        {count}
      </span>
    </Link>
  )
}
