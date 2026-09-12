import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { readFileSync } from "fs"
import { loadLocalEnv } from "../lib/load-env"

type JournalEntry = { idx: number; when: number; tag: string }

/**
 * Proves every journal entry actually reached the database.
 *
 * Drizzle does not track which migrations ran — it keeps a high-water mark
 * and applies an entry only when its journal `when` is greater than the
 * newest `created_at` in drizzle.__drizzle_migrations (pg-core/dialect.js).
 * So a migration added with a `when` below the mark is skipped in silence
 * and `migrate()` still exits 0. That is how 0056_meeting_notes never
 * reached production: it was dropped from the journal to unblock a deploy,
 * the next deploy carried the mark past it, and re-adding it changed
 * nothing. The pre-deploy was green and every admin page threw
 * `relation "meeting_notes" does not exist`.
 *
 * Matching on `when` rather than the file hash keeps this honest about what
 * ran: editing an old migration's text is not the same fault and must not
 * be reported as one.
 */
async function verifyNothingSkipped(client: postgres.Sql) {
  const journal = JSON.parse(
    readFileSync("./drizzle/meta/_journal.json", "utf8")
  ) as { entries: JournalEntry[] }

  const untagged = journal.entries.filter((entry) => !entry.tag)
  if (untagged.length > 0) {
    throw new Error(
      `Journal has ${untagged.length} entry/entries with no tag (idx ${untagged
        .map((e) => e.idx)
        .join(", ")}). Drizzle would look for drizzle/undefined.sql.`
    )
  }

  const rows = await client`
    select created_at from drizzle.__drizzle_migrations
  `
  const applied = new Set(rows.map((row) => Number(row.created_at)))
  const skipped = journal.entries.filter((entry) => !applied.has(entry.when))

  if (skipped.length > 0) {
    const mark = Math.max(0, ...Array.from(applied))
    const lines = skipped.map((e) => `  - ${e.tag} (when ${e.when})`).join("\n")
    const report =
      `${skipped.length} migration(s) in the journal never ran:\n${lines}\n\n` +
      `The applied high-water mark is ${mark}. Drizzle skips anything at or ` +
      `below it, silently. Do not lower the mark and do not renumber the ` +
      `entry — re-add the schema as a new, idempotent migration whose ` +
      `\`when\` is above ${mark}, the way 0059_meeting_notes_repair re-adds ` +
      `0056.`

    // The escape hatch exists because this check runs in the pre-deploy, and
    // a check that can wedge a deploy is a second outage waiting to happen.
    // It is for getting a site back up with a known-incomplete schema, not
    // for living with one: the deploy still prints everything it found.
    if (process.env.MIGRATE_ALLOW_SKIPPED === "1") {
      console.warn(`\nWARNING — MIGRATE_ALLOW_SKIPPED=1, deploying anyway.\n${report}\n`)
      return
    }
    throw new Error(report)
  }

  console.log(`Verified ${journal.entries.length} migrations applied.`)
}

async function main() {
  loadLocalEnv()
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }

  const client = postgres(url, { max: 1 })
  const db = drizzle(client)

  console.log("Running migrations…")
  await migrate(db, { migrationsFolder: "./drizzle" })
  await verifyNothingSkipped(client)
  console.log("Migrations complete.")
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
