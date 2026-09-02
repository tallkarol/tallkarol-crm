import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"

/**
 * Where each client's day happens. The workspace zone (`lib/timezone.ts`) is
 * Karol's own — punches and sheets resolve into it. A client's zone is what a
 * meeting time means when it is said in the client's terms; `/follow-up` reads
 * it to put "Friday at 2" on the calendar at the right instant.
 *
 * Kept in `app_settings` (one row, default + per-slug overrides) rather than a
 * column: it is a handful of values, edited from the command line
 * (`npm run client:tz`), and adding it needed no migration.
 */

const KEY = "client_timezones"
export const CLIENT_TZ_FALLBACK = "America/New_York"

export type ClientTimezones = { default: string; overrides: Record<string, string> }

export async function clientTimezones(): Promise<ClientTimezones> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) })
  const value = (row?.value ?? {}) as Partial<ClientTimezones>
  const overrides: Record<string, string> = {}
  for (const [slug, tz] of Object.entries(value.overrides ?? {})) {
    if (typeof tz === "string" && tz.trim()) overrides[slug] = tz.trim()
  }
  return {
    default: typeof value.default === "string" && value.default.trim() ? value.default.trim() : CLIENT_TZ_FALLBACK,
    overrides,
  }
}

export async function clientTimezoneFor(slug: string): Promise<string> {
  const all = await clientTimezones()
  return all.overrides[slug] ?? all.default
}

export async function setClientTimezones(next: ClientTimezones) {
  await db
    .insert(appSettings)
    .values({ key: KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } })
}
