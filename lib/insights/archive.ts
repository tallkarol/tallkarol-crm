import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { reports, snapshotArchive, type Site } from "@/db/schema"
import { ANALYTICS_SCOPES } from "@/lib/analytics"
import { googleAccessToken, googleAuthConfigured } from "@/lib/google-auth"
import { ADS_SCOPE } from "@/lib/insights/google"
import { isHouseSite, loadCrmSlice, windowDates } from "@/lib/insights/crm"
import { monthLabel, todayKey, windowTotals } from "@/lib/insights/derive"
import {
  fetchAdsCampaigns,
  fetchGa4Tables,
  fetchGscTables,
  type Ga4Tables,
  type GscTables,
} from "@/lib/insights/sources"
import type { AdsCampaignRow } from "@/lib/insights/types"
import type { ArchivePayload, SnapshotV2 } from "@/lib/insights/types"

function monthDays(period: string) {
  const [y, m] = period.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function prevPeriod(period: string) {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 7)
}

/**
 * A frozen month's dimensional tables are fetched for THAT month's dates —
 * the live snapshot's fixed 28-day tables would smear a neighboring month
 * into the report. One extra API pass per freeze; empty tables on failure so
 * the report just omits those sections instead of lying.
 */
async function fetchMonthTables(site: Site, first: string, last: string) {
  const empty = {
    ga4: null as Ga4Tables | null,
    gsc: null as GscTables | null,
    ads: null as AdsCampaignRow[] | null,
  }
  if (!googleAuthConfigured()) return empty
  let token: string
  try {
    token = await googleAccessToken(
      site.adsCustomerId ? [...ANALYTICS_SCOPES, ADS_SCOPE] : ANALYTICS_SCOPES
    )
  } catch {
    return empty
  }
  const period = first.slice(0, 7)
  const prior = prevPeriod(period)
  const priorFirst = `${prior}-01`
  const priorLast = `${prior}-${String(monthDays(prior)).padStart(2, "0")}`

  const [ga4, gsc, ads] = await Promise.all([
    site.ga4PropertyId
      ? fetchGa4Tables(token, site.ga4PropertyId, { startDate: first, endDate: last }).catch(
          () => null
        )
      : Promise.resolve(null),
    site.gscSiteUrl
      ? fetchGscTables(token, site.gscSiteUrl, {
          start: first,
          end: last,
          prevStart: priorFirst,
          prevEnd: priorLast,
        }).catch(() => null)
      : Promise.resolve(null),
    site.adsCustomerId
      ? fetchAdsCampaigns(token, site.adsCustomerId, { startDate: first, endDate: last }).catch(
          () => null
        )
      : Promise.resolve(null),
  ])
  return { ga4, gsc, ads }
}

/**
 * Freeze one calendar month into an ArchivePayload. Daily numbers come from
 * the snapshot's series; the tables are month-scoped fetches. `partial` marks
 * a month archived before it ended.
 */
export async function buildArchivePayload(
  site: Site,
  snapshot: SnapshotV2,
  period: string
): Promise<ArchivePayload | null> {
  const monthPoints = snapshot.daily.filter((p) => p.date.startsWith(period))
  if (monthPoints.length === 0) return null

  const first = monthPoints[0].date
  const last = monthPoints[monthPoints.length - 1].date
  const partial = monthPoints.length < monthDays(period) || last >= todayKey()

  const prevPoints = snapshot.daily.filter((p) => p.date.startsWith(prevPeriod(period)))
  const prevComplete = prevPoints.length >= monthDays(prevPeriod(period))

  const [tables, crm] = await Promise.all([
    fetchMonthTables(site, first, last),
    isHouseSite(site)
      ? (() => {
          const { start, end } = windowDates(first, last)
          return loadCrmSlice(start, end)
        })()
      : Promise.resolve(null),
  ])

  return {
    version: 1,
    siteName: site.name,
    siteSlug: site.slug,
    period,
    label: monthLabel(period),
    range: { start: first, end: last },
    partial,
    generatedAt: new Date().toISOString(),
    daily: monthPoints,
    totals: windowTotals(monthPoints),
    previous: prevComplete ? windowTotals(prevPoints) : null,
    ga4: {
      ok: Boolean(tables.ga4),
      channels: tables.ga4?.channels ?? [],
      pages: tables.ga4?.pages ?? [],
      events: tables.ga4?.events ?? [],
      devices: tables.ga4?.devices ?? [],
      countries: tables.ga4?.countries ?? [],
    },
    gsc: {
      ok: Boolean(tables.gsc),
      siteUrl: site.gscSiteUrl,
      queries: tables.gsc?.queries ?? [],
      pages: tables.gsc?.pages ?? [],
    },
    ads: {
      ok: Boolean(tables.ads),
      customerId: site.adsCustomerId,
      accountName: snapshot.ads?.accountName ?? "",
      currency: snapshot.ads?.currency ?? "USD",
      campaigns: tables.ads ?? [],
    },
    vercel: {
      ok: Boolean(snapshot.vercel?.ok),
      projectId: site.vercelProjectId,
      pages: snapshot.vercel?.pages ?? [],
      referrers: snapshot.vercel?.referrers ?? [],
      devices: snapshot.vercel?.devices ?? [],
      countries: snapshot.vercel?.countries ?? [],
    },
    pagespeed: snapshot.pagespeed,
    crm,
    health: snapshot.health,
  }
}

/** Insert or refresh the archive row for (site, period). Returns the row. */
export async function upsertArchive(site: Site, payload: ArchivePayload) {
  const [row] = await db
    .insert(snapshotArchive)
    .values({
      siteId: site.id,
      period: payload.period,
      label: payload.label,
      payload,
    })
    .onConflictDoUpdate({
      target: [snapshotArchive.siteId, snapshotArchive.period],
      set: { payload, label: payload.label, createdAt: new Date() },
    })
    .returning()
  return row
}

/** Find or draft the monthly report row this archive belongs to. */
async function ensureReportRow(site: Site, payload: ArchivePayload, archiveId: string) {
  const existing = await db.query.snapshotArchive.findFirst({
    where: eq(snapshotArchive.id, archiveId),
  })
  if (existing?.reportId) {
    await db
      .update(reports)
      .set({ periodLabel: payload.label, updatedAt: new Date() })
      .where(eq(reports.id, existing.reportId))
    return existing.reportId
  }
  const [report] = await db
    .insert(reports)
    .values({
      title: `${site.name} — ${payload.label} analytics`,
      clientId: site.clientId,
      cadence: "monthly",
      periodLabel: payload.label,
      status: "due",
      notes: `Generated by the Insights hub from the ${payload.label} snapshot of ${site.name}.`,
    })
    .returning()
  await db
    .update(snapshotArchive)
    .set({ reportId: report.id })
    .where(eq(snapshotArchive.id, archiveId))
  return report.id
}

/**
 * Called after every refresh: when the previous calendar month has no final
 * archive yet (none, or only a mid-month freeze), freeze it and draft its
 * report row. Months keep forever — a row is a few KB of JSON and it is the
 * trend history.
 */
export async function ensureMonthlyArchive(site: Site, snapshot: SnapshotV2) {
  const currentPeriod = todayKey().slice(0, 7)
  const period = prevPeriod(currentPeriod)
  // A month with no data at all (fresh property, sources not granted yet) is
  // not worth a report draft — explicit Generate still allows it.
  const hadData = snapshot.daily.some(
    (p) =>
      p.date.startsWith(period) &&
      (p.users > 0 ||
        p.sessions > 0 ||
        p.clicks > 0 ||
        p.impressions > 0 ||
        (p.adSpend ?? 0) > 0 ||
        (p.adClicks ?? 0) > 0)
  )
  if (!hadData) return null
  return archivePeriod(site, snapshot, period, { onlyIfStale: true })
}

/**
 * Archive one period. With `onlyIfStale`, an existing final (non-partial)
 * archive is left alone; a partial one is replaced now that the month closed.
 */
export async function archivePeriod(
  site: Site,
  snapshot: SnapshotV2,
  period: string,
  opts: { onlyIfStale?: boolean } = {}
) {
  if (opts.onlyIfStale) {
    const existing = await db.query.snapshotArchive.findFirst({
      where: and(eq(snapshotArchive.siteId, site.id), eq(snapshotArchive.period, period)),
    })
    const existingPartial =
      existing && (existing.payload as ArchivePayload | null)?.partial === true
    if (existing && !existingPartial) return existing
  }

  const payload = await buildArchivePayload(site, snapshot, period)
  if (!payload) return null

  const row = await upsertArchive(site, payload)
  await ensureReportRow(site, payload, row.id)
  return row
}
