import { and, eq, inArray, sql } from "drizzle-orm"
import { getDb } from "@/db"
import { gscFindings, gscScans, sites, tasks, type Site } from "@/db/schema"
import { scanSite } from "@/lib/insights/gsc-index"
import { findingsFrom, isTicketable, RULE_LABELS } from "@/lib/insights/gsc-rules"

/**
 * Run a scan, diff it against what we already knew, and leave behind three
 * things: the raw evidence, a finding per problem with a lifecycle, and one
 * maintenance task per site per period that the work bills against.
 *
 * The diff is the important part. A finding that appears in this scan and the
 * last one is the same finding seen twice, not new work. A finding that was
 * open and is now absent is a fix — and the date it stopped appearing is the
 * only evidence anyone needs that it was done.
 */

function periodOf(day: string) {
  return day.slice(0, 7)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export type ScanSummary = {
  slug: string
  scannedOn: string
  period: string
  urlCount: number
  passCount: number
  opened: number
  resolved: number
  stillOpen: number
  taskId: string | null
}

/**
 * One task per site per period, not one per finding. A retainer line that reads
 * "Search Console maintenance — August" is reviewable; thirty tickets called
 * "not indexed" are noise that nobody bills for because nobody reads them.
 */
async function upsertMaintenanceTask(params: {
  site: Site
  period: string
  scanId: string
  openFindings: { rule: string; url: string; severity: number }[]
}): Promise<string | null> {
  const db = getDb()
  const { site, period, scanId, openFindings } = params
  const ticketable = openFindings.filter(isTicketable)
  if (ticketable.length === 0) return null

  const label = new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
  const byRule = new Map<string, number>()
  for (const f of ticketable) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1)
  const breakdown = Array.from(byRule.entries())
    .map(([rule, n]) => `${n}× ${RULE_LABELS[rule] ?? rule}`)
    .join(", ")

  const notes = [
    `Auto-created from the Search Console scan on ${today()}.`,
    "",
    ...ticketable.map((f) => `- [${RULE_LABELS[f.rule] ?? f.rule}] ${f.url}`),
    "",
    "Findings close themselves: the first scan that stops seeing one records the",
    "date it was fixed. Nothing here needs ticking off by hand.",
  ].join("\n")

  // Match on provenance, not on the title — the same lesson `renewals.ts`
  // learned: rename a task and a naive matcher spawns a twin next run.
  const scanIds = await db
    .select({ id: gscScans.id })
    .from(gscScans)
    .where(and(eq(gscScans.siteId, site.id), eq(gscScans.period, period)))
  const ids = scanIds.map((r) => r.id)

  const existing = ids.length
    ? await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.source, "api"),
            eq(tasks.refKind, "gsc-scan"),
            eq(tasks.status, "open"),
            inArray(tasks.refId, ids)
          )
        )
        .limit(1)
    : []

  const title = `Search Console maintenance — ${label} (${ticketable.length} to fix: ${breakdown})`

  if (existing[0]) {
    await db
      .update(tasks)
      .set({ title, notes, updatedAt: new Date() })
      .where(eq(tasks.id, existing[0].id))
    return existing[0].id
  }

  const [created] = await db
    .insert(tasks)
    .values({
      title,
      clientId: site.clientId,
      cadence: "monthly",
      priority: ticketable.some((f) => f.severity === 1) ? 1 : 2,
      source: "api",
      refKind: "gsc-scan",
      refId: scanId,
      notes,
    })
    .returning({ id: tasks.id })
  return created?.id ?? null
}

export async function runGscScan(slug: string): Promise<ScanSummary> {
  const db = getDb()
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1)
  if (!site) throw new Error(`No site with slug "${slug}"`)
  if (!site.gscSiteUrl) throw new Error(`${slug} has no gscSiteUrl — nothing to scan`)
  if (!site.origin) throw new Error(`${slug} has no origin — cannot read its sitemap`)

  const scannedOn = today()
  const period = periodOf(scannedOn)
  const scan = await scanSite({ siteUrl: site.gscSiteUrl, origin: site.origin })
  const found = findingsFrom(scan)
  const passCount = scan.urls.filter((u) => u.verdict === "PASS").length

  const known = await db
    .select()
    .from(gscFindings)
    .where(eq(gscFindings.siteId, site.id))
  const knownByKey = new Map(known.map((k) => [k.key, k]))
  const seenKeys = new Set(found.map((f) => f.key))

  let opened = 0
  for (const f of found) {
    const prior = knownByKey.get(f.key)
    if (!prior) {
      opened += 1
      await db.insert(gscFindings).values({
        siteId: site.id,
        key: f.key,
        rule: f.rule,
        url: f.url,
        severity: f.severity,
        detail: f.detail,
        firstSeenOn: scannedOn,
        lastSeenOn: scannedOn,
      })
      continue
    }
    // Seen before. If it had been resolved and is back, it reopens — a
    // regression is not a new problem and should keep its original history.
    await db
      .update(gscFindings)
      .set({
        status: prior.status === "ignored" ? "ignored" : "open",
        resolvedOn: null,
        lastSeenOn: scannedOn,
        detail: f.detail,
        severity: f.severity,
        timesSeen: prior.timesSeen + 1,
        updatedAt: new Date(),
      })
      .where(eq(gscFindings.id, prior.id))
    if (prior.status === "resolved") opened += 1
  }

  // Absence is the evidence of a fix.
  const nowResolved = known.filter((k) => k.status === "open" && !seenKeys.has(k.key))
  if (nowResolved.length > 0) {
    await db
      .update(gscFindings)
      .set({ status: "resolved", resolvedOn: scannedOn, updatedAt: new Date() })
      .where(
        inArray(
          gscFindings.id,
          nowResolved.map((k) => k.id)
        )
      )
  }

  const [row] = await db
    .insert(gscScans)
    .values({
      siteId: site.id,
      scannedOn,
      period,
      urlCount: scan.urls.length,
      passCount,
      openedCount: opened,
      resolvedCount: nowResolved.length,
      sitemaps: scan.sitemaps,
      results: scan.urls,
    })
    .onConflictDoUpdate({
      target: [gscScans.siteId, gscScans.scannedOn],
      set: {
        urlCount: scan.urls.length,
        passCount,
        openedCount: opened,
        resolvedCount: nowResolved.length,
        sitemaps: scan.sitemaps,
        results: scan.urls,
      },
    })
    .returning({ id: gscScans.id })

  const taskId = await upsertMaintenanceTask({
    site,
    period,
    scanId: row.id,
    openFindings: found,
  })

  if (taskId) {
    // Link every finding this task covers, so the billing trail runs both ways.
    await db
      .update(gscFindings)
      .set({ taskId })
      .where(
        and(
          eq(gscFindings.siteId, site.id),
          eq(gscFindings.status, "open"),
          sql`${gscFindings.taskId} is null`
        )
      )
  }

  return {
    slug,
    scannedOn,
    period,
    urlCount: scan.urls.length,
    passCount,
    opened,
    resolved: nowResolved.length,
    stillOpen: found.filter(isTicketable).length,
    taskId,
  }
}
