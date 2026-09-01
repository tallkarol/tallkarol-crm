import { loadLocalEnv } from "../lib/load-env"

/**
 * Pull the Mineralife/Zemvelo marketing tracker into the CRM.
 *
 *   npm run tracker:sync              — configure the sheet if needed, then sync
 *   npm run tracker:sync -- --dry-run — print what would land, write nothing
 *   npm run tracker:sync -- --on      — turn write-back on
 *   npm run tracker:sync -- --off     — turn write-back off
 *   npm run tracker:sync -- --status  — print config, sync nothing
 */

const SHEET_ID = "7929165016682372"

async function main() {
  loadLocalEnv()
  const { getTrackerConfig, saveTrackerConfig, syncTracker } = await import(
    "../lib/smartsheet-tracker"
  )

  const args = process.argv.slice(2)
  let config = await getTrackerConfig()

  if (!config.sheetId) {
    config = await saveTrackerConfig({ sheetId: SHEET_ID, writeBack: false })
    console.log(`Configured tracker sheet ${config.sheetId}, write-back off.`)
  }
  if (args.includes("--on")) config = await saveTrackerConfig({ writeBack: true })
  if (args.includes("--off")) config = await saveTrackerConfig({ writeBack: false })

  console.log(
    `sheet ${config.sheetId} | write-back ${config.writeBack ? "ON" : "off"} | last sync ${config.lastSyncAt ?? "never"}`
  )
  if (args.includes("--status")) return

  const dryRun = args.includes("--dry-run")
  const result = await syncTracker({ dryRun })
  if (!result.ok) {
    console.error("Sync failed:", result.error)
    process.exit(1)
  }

  for (const p of result.planned ?? []) {
    console.log(
      `${p.clientKey.padEnd(10)} ${p.status.padEnd(16)} ${(p.dueOn ?? "—").padEnd(10)} ${p.name}`
    )
    console.log(`  ${p.slug}`)
  }
  console.log(
    `\n${dryRun ? "Would sync" : "Synced"} ${result.synced} project(s), skipped ${result.skipped}.`
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
