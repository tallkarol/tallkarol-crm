/**
 * Sites the CRM reports on.
 *
 *   npm run site:list
 *   npm run site:add -- zemvelo "Zemvelo" https://zemvelo.com 123456789 sc-domain:zemvelo.com
 *   npm run site:set -- zemvelo clientSlug zemvelo
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { clients, sites } from "../db/schema"

async function list() {
  const rows = await db.query.sites.findMany({
    orderBy: [asc(sites.sort), asc(sites.name)],
    with: { client: { columns: { slug: true } } },
  })
  if (!rows.length) return console.log("No sites yet.")
  for (const s of rows) {
    console.log(
      `${s.slug.padEnd(22)} ${s.name.padEnd(22)} CLIENT=${(s.client?.slug || "house").padEnd(22)} GA4=${(s.ga4PropertyId || "—").padEnd(12)} GSC=${(s.gscSiteUrl || "—").padEnd(28)} UPTIME=${s.uptimeMonitorId || "—"}`
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

  if (process.env.UPTIMEROBOT_API_KEY) {
    const { fetchUptimeMonitors, hostnameOf } = await import("../lib/uptimerobot")
    try {
      const monitors = await fetchUptimeMonitors()
      console.log("\nUptimeRobot monitors:")
      if (!monitors.length) console.log("  (none)")
      for (const monitor of monitors) {
        const used = known.find((k) => k.uptimeMonitorId === monitor.id)
        const host = hostnameOf(monitor.url)
        const guessed =
          used ??
          known.find((k) => hostnameOf(k.origin) === host || k.slug === host.split(".")[0])
        console.log(
          `  ${String(monitor.id).padEnd(12)} ${monitor.name.padEnd(24)} ${monitor.status.padEnd(10)} ${
            used
              ? `→ site "${used.slug}"`
              : guessed
                ? `· not wired (looks like "${guessed.slug}")`
                : "· not in sites"
          }`
        )
      }
      const orphans = monitors.filter((m) => !known.some((k) => k.uptimeMonitorId === m.id))
      if (orphans.length) {
        console.log("\nTo wire these, run:")
        for (const monitor of orphans) {
          const host = hostnameOf(monitor.url)
          const guess =
            known.find((k) => hostnameOf(k.origin) === host) ??
            known.find((k) => k.slug === host.split(".")[0])
          if (guess) {
            console.log(`  npm run site:set -- ${guess.slug} uptimeMonitorId ${monitor.id}`)
          }
        }
      }
    } catch (err) {
      console.log(`\nUptimeRobot: ${err instanceof Error ? err.message : err}`)
    }
  } else {
    console.log("\nUptimeRobot: no UPTIMEROBOT_API_KEY (read-only key).")
  }
}

async function set(slug: string, field: string, value: string) {
  const allowed = [
    "name",
    "origin",
    "ga4PropertyId",
    "gscSiteUrl",
    "measurementId",
    "uptimeMonitorId",
    "clientSlug",
  ] as const
  if (!allowed.includes(field as any)) {
    throw new Error(`field must be one of: ${allowed.join(", ")}`)
  }
  const row = await db.query.sites.findFirst({ where: eq(sites.slug, slug) })
  if (!row) throw new Error(`No site "${slug}"`)

  // `clientSlug` is the friendly name for the FK — two sites pointed at the
  // same client is how one client's several domains share a card on /uptime.
  if (field === "clientSlug") {
    let clientId: string | null = null
    if (value) {
      const client = await db.query.clients.findFirst({ where: eq(clients.slug, value) })
      if (!client) throw new Error(`No client "${value}"`)
      clientId = client.id
    }
    await db
      .update(sites)
      .set({ clientId, updatedAt: new Date() })
      .where(eq(sites.slug, slug))
    console.log(`${slug}.client = ${value || "(house)"}`)
    return
  }

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
