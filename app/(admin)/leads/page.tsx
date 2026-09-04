import { Suspense } from "react"
import { desc } from "drizzle-orm"
import { LeadsDashboard } from "@/components/leads/LeadsDashboard"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { toLeadListItem } from "@/lib/lead"

export const metadata = { title: "Leads" }

export default async function LeadsPage() {
  const rows = await db
    .select()
    .from(inquiries)
    .orderBy(desc(inquiries.createdAt))

  const leads = rows.map(toLeadListItem)

  return (
    <Suspense fallback={<p className="text-sm text-ink-3">Loading leads…</p>}>
      <LeadsDashboard leads={leads} />
    </Suspense>
  )
}
