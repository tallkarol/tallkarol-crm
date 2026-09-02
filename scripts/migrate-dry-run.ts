/**
 * Runs a migration file inside a transaction and rolls it back.
 *
 * Postgres makes DDL transactional, so this proves the SQL applies cleanly
 * against the real schema without leaving anything behind. Use it before
 * `npm run db:migrate` on a database that matters.
 *
 *   npx tsx scripts/migrate-dry-run.ts 0020_timesheet_punches
 */

import { readFileSync } from "fs"
import { join } from "path"
import postgres from "postgres"
import { loadLocalEnv } from "../lib/load-env"

async function main() {
  loadLocalEnv()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")

  const tag = process.argv[2]
  if (!tag) throw new Error("Pass a migration tag, e.g. 0020_timesheet_punches")

  const file = join(process.cwd(), "drizzle", `${tag}.sql`)
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  const sql = postgres(url, { max: 1 })
  console.log(`Dry-running ${tag} — ${statements.length} statements\n`)

  let applied = 0
  try {
    await sql.begin(async (tx) => {
      for (const statement of statements) {
        const label = statement.split("\n")[0].slice(0, 76)
        await tx.unsafe(statement)
        applied += 1
        console.log(`  ok  ${label}`)
      }

      // Prove the backfill actually landed before throwing it all away.
      const [entries] = await tx.unsafe(
        `select count(*)::int as total,
                count(user_id)::int as attributed,
                count(*) filter (where source = 'meeting')::int as from_meetings,
                count(*) filter (where source = 'manual')::int as manual
         from time_entries`
      )
      console.log("\n  time_entries after backfill:", entries)

      const [punches] = await tx.unsafe(
        `select count(*)::int as rows from time_punches`
      )
      console.log("  time_punches created, rows:", punches.rows)

      // The whole point of the partial index: two running punches cannot exist.
      const [user] = await tx.unsafe(`select id from users limit 1`)
      const [client] = await tx.unsafe(`select id from clients limit 1`)
      // 0044 relaxed this to "same target twice"; only assert while the index exists.
      const [oneRunning] = await tx.unsafe(
        `select 1 from pg_indexes where indexname = 'time_punches_one_running_idx'`
      )
      if (user && client && oneRunning) {
        await tx.unsafe(
          `insert into time_punches (user_id, client_id, started_at, status)
           values ('${user.id}', '${client.id}', now(), 'running')`
        )
        let blocked = false
        try {
          await tx.savepoint(async (sp) => {
            await sp.unsafe(
              `insert into time_punches (user_id, client_id, started_at, status)
               values ('${user.id}', '${client.id}', now(), 'running')`
            )
          })
        } catch {
          blocked = true
        }
        console.log(
          blocked
            ? "  ok  a second running punch is rejected by the index"
            : "  FAIL a second running punch was allowed"
        )
        if (!blocked) throw new Error("one-running-punch index did not hold")
      }

      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      console.error(`\nFailed after ${applied} statements:\n`, error)
      await sql.end()
      process.exit(1)
    }
  }

  console.log("\nRolled back. Nothing was changed.\n")
  await sql.end()
}

class RollbackSignal extends Error {}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
