import { loadLocalEnv } from "../lib/load-env"

loadLocalEnv()

const PUNCH_ID = "a3c619e3-12bf-4f1e-a4cf-9744ad38672b"
const SUMMARY =
  "uwd service areas pointed at /service-areas/, dealer locator added to the footer, slug and live page nesting fixes for /service-areas/, pr #2105"

async function main() {
  const { approvePunch } = await import("../lib/punches")
  const { db } = await import("../db")
  const { timePunches } = await import("../db/schema")
  const { eq } = await import("drizzle-orm")

  const [row] = await db
    .select({ userId: timePunches.userId, status: timePunches.status })
    .from(timePunches)
    .where(eq(timePunches.id, PUNCH_ID))
  if (!row) throw new Error("punch missing")
  if (row.status !== "stopped") throw new Error(`status is ${row.status}, not stopped`)

  const result = await approvePunch({
    punchId: PUNCH_ID,
    approvedBy: row.userId,
    summary: SUMMARY,
  })
  if (!result.ok) throw new Error(result.error)
  const p = result.data.punch
  console.log(
    JSON.stringify(
      {
        status: p.status,
        hours: p.hours,
        occurredOn: p.occurredOn,
        startClock: p.startClock,
        endClock: p.endClock,
        summary: p.note,
        timeEntryId: result.data.timeEntryId,
      },
      null,
      2
    )
  )
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
)
