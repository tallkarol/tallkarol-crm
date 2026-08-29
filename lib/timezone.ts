import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"

/**
 * The zone punches resolve into a day and a wall-clock time. Kept apart from
 * `lib/punch.ts` so the pure helpers there stay importable from client
 * components without dragging the database driver into the bundle.
 */

const TZ_KEY = "workspace_timezone"

export async function workspaceTimezone(): Promise<string> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, TZ_KEY),
  })
  const value = (row?.value ?? {}) as { timezone?: unknown }
  if (typeof value.timezone === "string" && value.timezone.trim()) {
    return value.timezone.trim()
  }
  return process.env.WORKSPACE_TIMEZONE || "America/New_York"
}

export async function setWorkspaceTimezone(timezone: string) {
  await db
    .insert(appSettings)
    .values({ key: TZ_KEY, value: { timezone }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: { timezone }, updatedAt: new Date() },
    })
}
