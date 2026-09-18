import { eq } from "drizzle-orm"
import { db } from "@/db"
import { sites } from "@/db/schema"
import { ensureMonthlyArchive } from "@/lib/insights/archive"
import { loadSnapshotV2 } from "@/lib/insights/load"
import { insightsCacheKey, type SnapshotV2 } from "@/lib/insights/types"
import { readReport, writeReport } from "@/lib/report-cache"

/**
 * Pull fresh analytics for one site and rewrite its cached snapshot.
 *
 * The core of the Refresh button, with no session check and no
 * revalidation: the server action wraps it after its own `getSessionUser`,
 * and the chat tool calls it from an approved card. The tool used to call
 * the action itself, which meant an approval arriving through the device
 * token route — no browser session — could never succeed.
 */
export async function refreshInsights(
  slug: string
): Promise<{ ok: true; site: { slug: string; name: string } } | { ok: false; error: string }> {
  const site = await db.query.sites.findFirst({ where: eq(sites.slug, slug) })
  if (!site) return { ok: false, error: `Site not found: ${slug}.` }

  try {
    const cached = await readReport<SnapshotV2>(insightsCacheKey(site.slug))
    const previous = cached.payload && cached.payload.version === 2 ? cached.payload : null
    const snapshot = await loadSnapshotV2(site, previous)
    await writeReport(insightsCacheKey(site.slug), snapshot)
    await ensureMonthlyArchive(site, snapshot)
    return { ok: true, site: { slug: site.slug, name: site.name } }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach Google."
    return { ok: false, error: message }
  }
}
