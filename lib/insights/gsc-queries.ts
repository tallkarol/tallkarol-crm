import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { getDb } from "@/db"
import { gscFindings, gscScans, type GscFinding, type GscScan } from "@/db/schema"

/** Read side for the Health tab and for anything that bills the work. */

export async function latestScan(siteId: string): Promise<GscScan | null> {
  const db = getDb()
  const [row] = await db
    .select()
    .from(gscScans)
    .where(eq(gscScans.siteId, siteId))
    .orderBy(desc(gscScans.scannedOn))
    .limit(1)
  return row ?? null
}

export async function openFindings(siteId: string): Promise<GscFinding[]> {
  const db = getDb()
  return db
    .select()
    .from(gscFindings)
    .where(and(eq(gscFindings.siteId, siteId), eq(gscFindings.status, "open")))
    .orderBy(gscFindings.severity, gscFindings.firstSeenOn)
}

/**
 * What a month of maintenance actually consisted of.
 *
 * `resolved` is the billable half — every problem that stopped appearing during
 * the period, with the date it went away. `stillOpen` is the honest other half:
 * work carried forward, which a package should show rather than hide.
 */
export async function maintenancePackage(siteId: string, period: string) {
  const db = getDb()
  const start = `${period}-01`
  const end = new Date(
    Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)
  )
    .toISOString()
    .slice(0, 10)

  const [resolved, opened, stillOpen, scans] = await Promise.all([
    db
      .select()
      .from(gscFindings)
      .where(
        and(
          eq(gscFindings.siteId, siteId),
          eq(gscFindings.status, "resolved"),
          gte(gscFindings.resolvedOn, start),
          lte(gscFindings.resolvedOn, end)
        )
      )
      .orderBy(gscFindings.resolvedOn),
    db
      .select()
      .from(gscFindings)
      .where(
        and(
          eq(gscFindings.siteId, siteId),
          gte(gscFindings.firstSeenOn, start),
          lte(gscFindings.firstSeenOn, end)
        )
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(gscFindings)
      .where(and(eq(gscFindings.siteId, siteId), eq(gscFindings.status, "open"))),
    db
      .select()
      .from(gscScans)
      .where(and(eq(gscScans.siteId, siteId), eq(gscScans.period, period)))
      .orderBy(gscScans.scannedOn),
  ])

  return {
    period,
    scans: scans.length,
    scanDates: scans.map((s) => s.scannedOn),
    opened: opened.length,
    resolved,
    stillOpen: stillOpen[0]?.n ?? 0,
  }
}
