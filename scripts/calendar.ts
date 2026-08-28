/**
 * Calendar sources from the command line, so connecting and syncing does not
 * require a browser session.
 *
 *   npm run calendar:add -- google "Personal" you@gmail.com
 *   npm run calendar:list
 *   npm run calendar:sync
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { calendarEvents, calendarSources } from "../db/schema"
import type { CalendarSourceKind } from "../db/schema"
import { SOURCE_PALETTE } from "../lib/calendar-types"
import { syncAllCalendars } from "../lib/calendar-sync"

async function list() {
  const rows = await db.query.calendarSources.findMany({
    orderBy: [asc(calendarSources.sort), asc(calendarSources.label)],
  })
  if (!rows.length) return console.log("No calendars connected.")
  for (const row of rows) {
    const [{ count }] = await db
      .select({ count: db.$count(calendarEvents, eq(calendarEvents.sourceId, row.id)) })
      .from(calendarSources)
      .where(eq(calendarSources.id, row.id))
    console.log(
      `${row.enabled ? "on " : "off"}  ${row.kind.padEnd(7)} ${row.label.padEnd(22)} ${row.externalId.padEnd(28)} ` +
        `${count} event(s)${row.writable ? "  [destination]" : ""}${row.lastError ? `  ERROR: ${row.lastError}` : ""}`
    )
  }
}

async function add(kind: string, label: string, externalId = "") {
  if (!["google", "cal_com", "ics"].includes(kind)) {
    throw new Error(`kind must be google | cal_com | ics (got "${kind}")`)
  }
  const existing = await db.query.calendarSources.findMany()
  if (existing.some((r) => r.kind === kind && r.externalId === externalId)) {
    return console.log(`Already connected: ${label}`)
  }
  const [row] = await db
    .insert(calendarSources)
    .values({
      kind: kind as CalendarSourceKind,
      label,
      externalId,
      color: SOURCE_PALETTE[existing.length % SOURCE_PALETTE.length],
      sort: existing.length,
    })
    .returning({ id: calendarSources.id })
  console.log(`Connected ${label} (${row.id})`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (command === "add") await add(rest[0], rest[1], rest[2])
  else if (command === "sync") {
    const { synced, errors } = await syncAllCalendars()
    console.log(`Synced ${synced} event(s).`)
    for (const error of errors) console.log(`  ! ${error}`)
  } else await list()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
