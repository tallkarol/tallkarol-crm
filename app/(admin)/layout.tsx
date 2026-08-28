import { and, eq, ne, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/AppShell"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [inbox] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inquiries)
    .where(eq(inquiries.status, "new"))

  const [needsLook] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inquiries)
    .where(
      and(
        ne(inquiries.status, "closed"),
        sql`(payload->'lead'->>'qualification' is null or payload->'lead'->>'qualification' = 'unreviewed')`
      )
    )

  return (
    <AppShell
      email={user.email}
      inboxBadge={Number(inbox?.count ?? 0)}
      leadsBadge={Number(needsLook?.count ?? 0)}
    >
      {children}
    </AppShell>
  )
}
