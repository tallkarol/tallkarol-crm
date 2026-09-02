"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { reports, sites, snapshotArchive } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { archivePeriod, ensureMonthlyArchive } from "@/lib/insights/archive"
import { loadSnapshotV2 } from "@/lib/insights/load"
import { insightsCacheKey, type SnapshotV2 } from "@/lib/insights/types"
import { readReport, writeReport } from "@/lib/report-cache"

/**
 * The only thing that calls GA4 / Search Console / Ads for the hub. Page views read
 * the stored snapshot; this runs when someone presses Refresh. It also closes
 * out the previous month into snapshot_archive the first time it runs after
 * a month ends.
 */
export async function refreshInsightsAction(slug: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }

  const site = await db.query.sites.findFirst({ where: eq(sites.slug, slug) })
  if (!site) return { ok: false as const, error: "Site not found." }

  try {
    const cached = await readReport<SnapshotV2>(insightsCacheKey(site.slug))
    const previous =
      cached.payload && cached.payload.version === 2 ? cached.payload : null
    const snapshot = await loadSnapshotV2(site, previous)
    await writeReport(insightsCacheKey(site.slug), snapshot)
    await ensureMonthlyArchive(site, snapshot)
    revalidatePath("/insights", "layout")
    revalidatePath("/ads", "layout")
    revalidatePath("/clients", "layout")
    revalidatePath("/reports")
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach Google."
    return { ok: false as const, error: message }
  }
}

/**
 * "Generate report" on the Reports tab: freeze the chosen month — daily
 * numbers from the cached snapshot, dimensional tables fetched for that
 * month's exact dates — and make sure its report row exists. Safe to
 * regenerate — the archive row is upserted.
 */
export async function generateArchiveAction(slug: string, period: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return { ok: false as const, error: "Bad period." }
  }

  const site = await db.query.sites.findFirst({ where: eq(sites.slug, slug) })
  if (!site) return { ok: false as const, error: "Site not found." }

  const cached = await readReport<SnapshotV2>(insightsCacheKey(site.slug))
  if (!cached.payload || cached.payload.version !== 2) {
    return { ok: false as const, error: "Fetch a snapshot first — there is nothing to freeze." }
  }

  const row = await archivePeriod(site, cached.payload, period)
  if (!row) {
    return { ok: false as const, error: "The snapshot has no days in that month." }
  }
  revalidatePath("/insights", "layout")
  revalidatePath("/reports")
  return { ok: true as const, period }
}

/** Mark a generated report row as filed (sent). */
export async function markReportFiledAction(archiveId: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }

  const archive = await db.query.snapshotArchive.findFirst({
    where: eq(snapshotArchive.id, archiveId),
  })
  if (!archive?.reportId) return { ok: false as const, error: "No report row." }
  await db
    .update(reports)
    .set({ status: "filed", updatedAt: new Date() })
    .where(eq(reports.id, archive.reportId))
  revalidatePath("/insights", "layout")
  revalidatePath("/reports")
  return { ok: true as const }
}
