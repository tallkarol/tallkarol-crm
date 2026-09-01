/**
 * Seed the pilot experiment — the homepage intake form on mycustommanufacturer
 * — and capture its baseline reading.
 *
 *   npm run experiment:seed
 *
 * Safe to re-run: the experiment is upserted on (site, slug) and the baseline
 * reading on (experiment, checkpoint).
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { experimentReadings, experiments, sites } from "../db/schema"
import { captureReading } from "../lib/experiments/capture"
import { checkpointWindow } from "../lib/experiments/types"
import type { FormLocationSpec, PageSpec } from "../lib/experiments/types"

const SITE_SLUG = "mycustommanufacturer"
const SLUG = "homepage-intake-form"

const PAGES: PageSpec[] = [
  { key: "home", label: "Homepage", path: "/", role: "target" },
  { key: "contact", label: "Contact page", path: "/contact", role: "guardrail" },
  {
    key: "who_we_work_with",
    label: "Who we work with",
    path: "/who-we-work-with",
    role: "context",
  },
]

const FORM_LOCATIONS: FormLocationSpec[] = [
  { key: "home_hero", label: "Homepage hero" },
  { key: "home_good_fit", label: "Homepage foot" },
  { key: "contact", label: "Contact page" },
  { key: "lp_inquiry", label: "Landing pages" },
  { key: "services_closing", label: "Services pages" },
  { key: "who_we_work_with", label: "Who we work with" },
]

async function main() {
  const site = await db.query.sites.findFirst({ where: eq(sites.slug, SITE_SLUG) })
  if (!site) throw new Error(`No site with slug ${SITE_SLUG}`)

  const values = {
    siteId: site.id,
    slug: SLUG,
    name: "Homepage intake form",
    hypothesis:
      "The homepage is the biggest destination on the site and handed almost none of its traffic to a form. Put a form where the traffic already is and some share of those sessions will start it — without simply moving starts off the contact page.",
    changeNote:
      "1 Sep 2026: condensed intake wizard added to the homepage hero. A full wizard already sat at the foot of the page, so the homepage now has two entry points into the same form. Before this, it had none.",
    startedOn: "2026-09-01",
    baselineFrom: "2026-07-03",
    baselineTo: "2026-08-31",
    pages: PAGES,
    formLocations: FORM_LOCATIONS,
    status: "running",
    notes:
      "Before-and-after, not a split test: paid landing pages went live 31 Aug and a US campaign follows, so traffic mix moves underneath this. The contact-page guardrail is what keeps the read honest.",
  }

  const [row] = await db
    .insert(experiments)
    .values(values)
    .onConflictDoUpdate({
      target: [experiments.siteId, experiments.slug],
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  console.log(`experiment ${row.slug} (${row.id})`)

  const window = checkpointWindow(row, "baseline")
  console.log(`capturing baseline ${window.from} → ${window.to} …`)
  const payload = await captureReading({
    site,
    from: window.from,
    to: window.to,
    pages: PAGES,
    formLocations: FORM_LOCATIONS,
  })

  await db
    .insert(experimentReadings)
    .values({
      experimentId: row.id,
      checkpoint: "baseline",
      windowFrom: window.from,
      windowTo: window.to,
      payload,
      note: "Captured at seed time from GA4.",
    })
    .onConflictDoUpdate({
      target: [experimentReadings.experimentId, experimentReadings.checkpoint],
      set: { payload, capturedAt: new Date() },
    })

  for (const page of PAGES) {
    const c = payload.pages[page.key]
    console.log(
      `  ${page.label.padEnd(20)} sessions=${String(c.sessions).padStart(4)} ` +
        `starts=${String(c.formStarts).padStart(3)} enquiries=${String(c.leads).padStart(3)}`
    )
  }
  console.log(
    `  ${"sitewide".padEnd(20)} sessions=${String(payload.sitewide.sessions).padStart(4)} ` +
      `starts=${String(payload.sitewide.formStarts).padStart(3)} enquiries=${String(payload.sitewide.leads).padStart(3)}`
  )
  for (const caveat of payload.caveats) console.log(`  · ${caveat}`)

  const existing = await db.query.experimentReadings.findMany({
    where: and(eq(experimentReadings.experimentId, row.id)),
  })
  console.log(`\n${existing.length} reading(s) stored.`)
  process.exit(0)
}

main().catch((e) => {
  console.error("FATAL", e.message)
  process.exit(1)
})
