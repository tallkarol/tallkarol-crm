/**
 * Links a downloaded service-account JSON into .env.local, then proves the
 * credential actually reaches GA4, Search Console, and Calendar.
 *
 *   npm run google:link -- ~/Downloads/tk-crm-abc123.json
 *   npm run google:check
 */
import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { loadLocalEnv } from "../lib/load-env"

const ENV_FILE = resolve(process.cwd(), ".env.local")

type ServiceAccountJson = {
  client_email?: string
  private_key?: string
  project_id?: string
}

function upsertEnv(pairs: Record<string, string>) {
  const original = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : ""
  let text = original
  for (const [key, value] of Object.entries(pairs)) {
    // Values are quoted and single-line; the private key keeps literal \n
    // escapes, which readServiceAccount() turns back into real newlines.
    const line = `${key}="${value}"`
    const existing = new RegExp(`^${key}=.*$`, "m")
    text = existing.test(text)
      ? text.replace(existing, line)
      : `${text.replace(/\n*$/, "")}\n${line}\n`
  }
  if (text === original) return false
  writeFileSync(ENV_FILE, text)
  return true
}

function link(path: string) {
  const file = resolve(process.cwd(), path.replace(/^~/, process.env.HOME ?? "~"))
  if (!existsSync(file)) throw new Error(`No such file: ${file}`)

  const sa = JSON.parse(readFileSync(file, "utf8")) as ServiceAccountJson
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      "That JSON has no client_email / private_key — is it a service account key?"
    )
  }

  upsertEnv({
    GOOGLE_PROJECT_ID: sa.project_id ?? "",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: sa.client_email,
    GOOGLE_SERVICE_ACCOUNT_KEY: sa.private_key.replace(/\n/g, "\\n"),
  })

  console.log(`Wrote credentials to .env.local`)
  console.log(`  project  ${sa.project_id ?? "(none in key)"}`)
  console.log(`  robot    ${sa.client_email}`)
  console.log(
    `\nThat robot address is what you share calendars, GA4 properties, and Search Console sites with.`
  )
}

/* ------------------------------------------------------------------ check -- */

const OK = "  ✓"
const NO = "  ✗"

function explain(status: number, body: string) {
  if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(body)) {
    const api = body.match(/([a-z]+\.googleapis\.com)/)?.[1] ?? "the API"
    return `not enabled — turn on ${api} in APIs & Services → Library`
  }
  if (status === 403) return "permission denied — the robot has not been granted access yet"
  if (status === 401) return "credential rejected — check the key in .env.local"
  const message = body.match(/"message":\s*"([^"]{1,160})"/)?.[1]
  return message ? `${status} — ${message}` : `HTTP ${status}`
}

async function probe(label: string, run: () => Promise<Response>, onOk: (json: any) => string) {
  try {
    const res = await run()
    const text = await res.text()
    if (!res.ok) {
      console.log(`${NO} ${label}: ${explain(res.status, text)}`)
      return false
    }
    let json: any = null
    try { json = JSON.parse(text) } catch { /* empty body is fine */ }
    console.log(`${OK} ${label}: ${onOk(json)}`)
    return true
  } catch (error) {
    console.log(`${NO} ${label}: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

async function check() {
  const { googleAccessToken, googleAuthConfigured, readServiceAccount } =
    await import("../lib/google-auth")

  if (!googleAuthConfigured()) {
    console.log("No service account in .env.local.")
    console.log("Run:  npm run google:link -- <path-to-key.json>")
    process.exit(1)
  }

  const sa = readServiceAccount()!
  console.log(`robot    ${sa.client_email}`)
  console.log(`project  ${sa.project_id || process.env.GOOGLE_PROJECT_ID || "(unset)"}\n`)

  const { db } = await import("../db")
  const { sites } = await import("../db/schema")
  const { asc } = await import("drizzle-orm")
  const allSites = await db.query.sites.findMany({
    orderBy: [asc(sites.sort), asc(sites.name)],
  })

  let token: string
  try {
    token = await googleAccessToken([
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
      // calendarList.list needs a read scope; calendar.events alone only covers
      // event operations on a calendar you already name.
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/adwords",
    ])
    console.log(`${OK} token: minted, so the key itself is valid`)
  } catch (error) {
    console.log(`${NO} token: ${error instanceof Error ? error.message : error}`)
    console.log("\nThe key is bad or malformed. Re-run google:link with the JSON.")
    process.exit(1)
  }

  const auth = { Authorization: `Bearer ${token}` }

  let allSitesOk = allSites.length > 0
  for (const site of allSites) {
    console.log(`  ${site.name} (${site.slug})`)
    const ga4Ok = site.ga4PropertyId
      ? await probe(
          "  GA4",
          () =>
            fetch(
              `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga4PropertyId}:runReport`,
              {
                method: "POST",
                headers: { ...auth, "Content-Type": "application/json" },
                body: JSON.stringify({
                  dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
                  metrics: [{ name: "activeUsers" }],
                }),
              }
            ),
          (json) =>
            `readable — ${json?.rows?.[0]?.metricValues?.[0]?.value ?? 0} active users in 7d`
        )
      : (console.log("  ✗   GA4: no property id on this site"), false)

    const gscOk = site.gscSiteUrl
      ? await probe(
          "  Search Console",
          () =>
            fetch(
              `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.gscSiteUrl)}/searchAnalytics/query`,
              {
                method: "POST",
                headers: { ...auth, "Content-Type": "application/json" },
                body: JSON.stringify({
                  startDate: "2020-01-01",
                  endDate: "2038-01-01",
                  dimensions: ["query"],
                  rowLimit: 1,
                }),
              }
            ),
          () => `readable — ${site.gscSiteUrl}`
        )
      : (console.log("  ✗   Search Console: no property on this site"), false)

    if (!ga4Ok || !gscOk) allSitesOk = false
    if (!ga4Ok && site.ga4PropertyId) {
      console.log(`      → GA4 property ${site.ga4PropertyId}: add ${sa.client_email} as Viewer`)
    }
    if (!gscOk && site.gscSiteUrl) {
      console.log(`      → Search Console ${site.gscSiteUrl}: add ${sa.client_email}`)
    }

    if (site.adsCustomerId) {
      const { adsSearch } = await import("../lib/insights/google")
      const adsOk = await probe(
        "  Google Ads",
        async () => {
          await adsSearch(
            token,
            "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1",
            site.adsCustomerId
          )
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        },
        () => `readable — ${site.adsCustomerId}`
      )
      if (!adsOk) {
        allSitesOk = false
        console.log(
          `      → Google Ads ${site.adsCustomerId}: add ${sa.client_email} as Read-only, check GOOGLE_ADS_DEVELOPER_TOKEN`
        )
      }
    }
  }
  if (!allSites.length) console.log("  no sites configured — npm run site:add")
  console.log("")

  const ads = await import("../lib/insights/google")
  if (ads.adsDeveloperToken()) {
    try {
      const ids = await ads.adsListAccessibleCustomers(token)
      const envId = ads.adsCustomerId()
      console.log(
        `${OK} Google Ads: ${ids.length} accessible customer(s)${ids.length ? ` — ${ids.join(", ")}` : ""}`
      )
      if (envId && !ids.includes(envId)) {
        console.log(`      → env GOOGLE_ADS_CUSTOMER_ID ${envId} is not visible to this robot`)
      }
      if (envId && !allSites.some((s) => s.adsCustomerId === envId)) {
        console.log(`      → npm run site:set -- <slug> adsCustomerId ${envId}`)
      }
    } catch (error) {
      console.log(`${NO} Google Ads: ${error instanceof Error ? error.message : error}`)
      console.log("      → enable Google Ads API, add the robot as Read-only, check the developer token")
    }
  } else {
    console.log(`${NO} Google Ads: no GOOGLE_ADS_DEVELOPER_TOKEN`)
  }
  console.log("")

  let calendarCount = 0
  let configuredCalendars = 0
  let readableCalendars = 0
  const calOk = await probe(
    "Calendar API",
    () =>
      fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: auth,
      }),
    (json) => {
      const items = json?.items ?? []
      calendarCount = items.length
      return items.length
        ? `${items.length} calendar(s): ${items.map((c: any) => c.id).join(", ")}`
        : "reachable, but no calendars are on the robot's list (see note below)"
    }
  )

  // Anything already configured in the CRM gets read for real.
  try {
    loadLocalEnv()
    const { db } = await import("../db")
    const { calendarSources } = await import("../db/schema")
    const rows = await db.select().from(calendarSources)
    const google = rows.filter((r) => r.kind === "google")
    if (google.length) {
      console.log("")
      configuredCalendars = google.length
      for (const source of google) {
        const ok = await probe(
          `calendar "${source.label}"`,
          () =>
            fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.externalId)}/events?maxResults=1`,
              { headers: auth }
            ),
          () => "readable"
        )
        if (ok) readableCalendars += 1
      }
    }
  } catch {
    /* DB is optional for this check */
  }

  console.log("\nNext:")
  const calendarsGood =
    configuredCalendars > 0
      ? readableCalendars === configuredCalendars
      : calendarCount > 0
  if (!calOk || !calendarsGood) {
    console.log(`  · Calendar settings → Share with specific people → add ${sa.client_email}`)
  }
  if (allSitesOk && calendarsGood) {
    console.log("  · Nothing. Open the CRM and press Fetch on Analytics.")
  }
}

async function main() {
  loadLocalEnv()
  const [command, arg] = process.argv.slice(2)
  if (command === "link") {
    if (!arg) throw new Error("Usage: npm run google:link -- <path-to-key.json>")
    link(arg)
    console.log("\nNow run: npm run google:check")
    return
  }
  await check()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
