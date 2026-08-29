import { and, eq, ne, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/AppShell"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { loadInbox } from "@/lib/inbox-data"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  // The Inbox badge counts unread across every kind, not just new inquiries —
  // otherwise a stream of tickets and mail sits behind a badge reading zero.
  const [inbox, needsLook] = await Promise.all([
    loadInbox().then((data) => data.counts.unread),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inquiries)
      .where(
        and(
          ne(inquiries.status, "closed"),
          sql`(payload->'lead'->>'qualification' is null or payload->'lead'->>'qualification' = 'unreviewed')`
        )
      )
      .then(([row]) => Number(row?.count ?? 0)),
  ])

  return (
    <AppShell email={user.email} inboxBadge={inbox} leadsBadge={needsLook}>
      {children}
    </AppShell>
  )
}
