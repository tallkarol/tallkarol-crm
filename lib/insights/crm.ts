import { and, desc, gte, lt } from "drizzle-orm"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { readAttribution, sourceLabel } from "@/lib/attribution"
import { readLead } from "@/lib/lead"
import type { CrmSlice } from "@/lib/insights/types"
import type { Site } from "@/db/schema"

/**
 * Inquiries land in this CRM only from tallkarol.com, so the GA4 ↔ CRM join
 * exists for the house property alone. House = a site with no client row.
 */
export function isHouseSite(site: Pick<Site, "clientId">) {
  return site.clientId == null
}

/**
 * The loop-closing numbers for a window: inquiries that arrived, how many are
 * marked fit, and which attribution source produced the most of them. Read
 * live from the local DB — cheap, always current, never cached.
 */
export async function loadCrmSlice(start: Date, end: Date): Promise<CrmSlice> {
  const rows = await db.query.inquiries.findMany({
    where: and(gte(inquiries.createdAt, start), lt(inquiries.createdAt, end)),
    orderBy: [desc(inquiries.createdAt)],
  })

  const bySource = new Map<string, number>()
  let fit = 0
  const recent = rows.slice(0, 8).map((row) => {
    const lead = readLead(row.payload)
    return {
      id: row.id,
      name: row.name,
      company: row.company,
      createdAt: row.createdAt.toISOString(),
      sourceLabel: sourceLabel(readAttribution(row.payload)),
      qualification: lead.qualification,
    }
  })
  for (const row of rows) {
    const lead = readLead(row.payload)
    if (lead.qualification === "fit") fit += 1
    const label = sourceLabel(readAttribution(row.payload))
    if (label) bySource.set(label, (bySource.get(label) || 0) + 1)
  }
  let topSource: string | null = null
  let best = 0
  bySource.forEach((count, label) => {
    if (count > best) {
      best = count
      topSource = label
    }
  })
  return { inquiries: rows.length, fit, topSource, recent }
}

/** Window helper: [start, end) as UTC instants for the day-key range. */
export function windowDates(firstDay: string, lastDay: string) {
  const start = new Date(`${firstDay}T00:00:00Z`)
  const end = new Date(`${lastDay}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start, end }
}
