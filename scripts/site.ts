/**
 * Sites the CRM reports on.
 *
 *   npm run site:list
 *   npm run site:add -- zemvelo "Zemvelo" https://zemvelo.com 123456789 sc-domain:zemvelo.com
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { sites } from "../db/schema"

async function list() {
  const rows = await db.query.sites.findMany({ orderBy: [asc(sites.sort), asc(sites.name)] })
  if (!rows.length) return console.log("No sites yet.")
  for (const s of rows) {
    console.log(
      `${s.slug.padEnd(14)} ${s.name.padEnd(20)} GA4=${(s.ga4PropertyId || "—").padEnd(12)} GSC=${s.gscSiteUrl || "—"}`
    )
  }
}

async function add(
  slug: string,
  name: string,
  origin = "",
  ga4PropertyId = "",
  gscSiteUrl = "",
  measurementId = ""
) {
  if (!slug || !name) throw new Error('Usage: site:add -- <slug> "<Name>" [origin] [ga4Id] [gscSiteUrl] [measurementId]')
  const existing = await db.query.sites.findMany()
  if (existing.some((s) => s.slug === slug)) return console.log(`"${slug}" already exists.`)
  await db.insert(sites).values({
    slug,
    name,
    origin: origin.replace(/\/$/, ""),
    ga4PropertyId,
    gscSiteUrl,
    measurementId,
    sort: existing.length,
  })
  console.log(`Added ${name} (${slug})`)
}

/**
 * Everything the service account can currently read. Saves hunting for property
 * IDs by hand — grant the robot access, then run this.
 */
async function discover() {
  const { googleAccessToken, googleAuthConfigured } = await import("../lib/google-auth")
  if (!googleAuthConfigured()) throw new Error("No service account — run npm run google:link")

  const token = await googleAccessToken([
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
  ])
  const auth = { Authorization: `Bearer ${token}` }
  const known = await db.query.sites.findMany()

  const ga4Res = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    { headers: auth }
  )
  const ga4Json: any = ga4Res.ok ? await ga4Res.json() : {}
  const properties = (ga4Json.accountSummaries ?? []).flatMap((a: any) =>
    (a.propertySummaries ?? []).map((p: any) => ({
      id: String(p.property ?? "").replace("properties/", ""),
      name: p.displayName ?? "",
      account: a.displayName ?? "",
    }))
  )

  const gscRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: auth,
  })
  const gscJson: any = gscRes.ok ? await gscRes.json() : {}
  const gscSites = (gscJson.siteEntry ?? []).map((e: any) => e.siteUrl as string)

  console.log("GA4 properties the robot can read:")
  if (!properties.length) console.log("  (none)")
  for (const p of properties) {
    const used = known.find((k) => k.ga4PropertyId === p.id)
    console.log(`  ${p.id.padEnd(12)} ${p.name.padEnd(28)} ${used ? `→ site "${used.slug}"` : "· not in sites"}`)
  }

  console.log("\nSearch Console properties the robot can read:")
  if (!gscSites.length) console.log("  (none)")
  for (const site of gscSites) {
    const used = known.find((k) => k.gscSiteUrl === site)
    console.log(`  ${site.padEnd(40)} ${used ? `→ site "${used.slug}"` : "· not in sites"}`)
  }

  // Suggest a row for anything visible but not yet tracked.
  const orphanGa4 = properties.filter((p: any) => !known.some((k) => k.ga4PropertyId === p.id))
  if (orphanGa4.length) {
    console.log("\nTo track these, run:")
    for (const p of orphanGa4) {
      // GA4 display names are rarely domains ("Zemvelo - GA4"), so only trust
      // one as an origin when it actually looks like a hostname.
      const cleaned = p.name.replace(/^https?:\/\//, "").replace(/\/$/, "").trim()
      const isHost = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)
      const stem = (isHost ? cleaned.split(".")[0] : cleaned.split(/[\s-]+/)[0])
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
      const slug = stem || "site"
      const gsc =
        gscSites.find((g: string) => g.replace("sc-domain:", "").split(".")[0] === slug) ?? ""
      const origin = isHost ? `https://${cleaned}` : `https://${slug}.com`
      console.log(
        `  npm run site:add -- ${slug} "${p.name}" ${origin} ${p.id} ${gsc || "<gsc-property>"}`
      )
    }
  }
}

async function set(slug: string, field: string, value: string) {
  const allowed = ["name", "origin", "ga4PropertyId", "gscSiteUrl", "measurementId"] as const
  if (!allowed.includes(field as any)) {
    throw new Error(`field must be one of: ${allowed.join(", ")}`)
  }
  const row = await db.query.sites.findFirst({ where: eq(sites.slug, slug) })
  if (!row) throw new Error(`No site "${slug}"`)
  await db
    .update(sites)
    .set({ [field]: value, updatedAt: new Date() })
    .where(eq(sites.slug, slug))
  console.log(`${slug}.${field} = ${value || "(cleared)"}`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (command === "set") await set(rest[0], rest[1], rest[2] ?? "")
  else if (command === "add") await add(rest[0], rest[1], rest[2], rest[3], rest[4], rest[5])
  else if (command === "discover") await discover()
  else await list()
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
