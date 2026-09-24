import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"

/**
 * The zone punches resolve into a day and a wall-clock time. Kept apart from
 * `lib/punch.ts` so the pure helpers there stay importable from client
 * components without dragging the database driver into the bundle.
 *
 * Memoized per process for a minute, the way client colours are: every punch
 * read awaited this row after its own query, a round trip per page for a
 * value that changes about never. The setter drops the memo, so a change
 * shows at once here and within the minute in any other process.
 */

const TZ_KEY = "workspace_timezone"
const TTL_MS = 60_000
let memo: { at: number; value: string } | null = null

export async function workspaceTimezone(): Promise<string> {
  const now = Date.now()
  if (memo && now - memo.at < TTL_MS) return memo.value
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, TZ_KEY),
  })
  const value = (row?.value ?? {}) as { timezone?: unknown }
  const timezone =
    typeof value.timezone === "string" && value.timezone.trim()
      ? value.timezone.trim()
      : process.env.WORKSPACE_TIMEZONE || "America/New_York"
  memo = { at: now, value: timezone }
  return timezone
}

export async function setWorkspaceTimezone(timezone: string) {
  await db
    .insert(appSettings)
    .values({ key: TZ_KEY, value: { timezone }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: { timezone }, updatedAt: new Date() },
    })
  memo = null
}
