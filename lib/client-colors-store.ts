import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"
import { CLIENT_COLORS, isHexColor, setColorOverrides } from "@/lib/client-colors"

/**
 * Stored overrides for the per-slug accent palette.
 *
 * Kept in `app_settings` rather than a `clients.color` column because the
 * palette is slug-keyed and spans more than clients — Spectramotus, Jive,
 * Momentum and Daedalus are products, and they carry accents too. One jsonb
 * map covers both without a migration or a second lookup.
 *
 * `CLIENT_COLORS` in `lib/client-colors.ts` stays as the defaults. A slug with
 * no stored value falls back to it, so nothing changes appearance until it is
 * deliberately overridden.
 */

const KEY = "client-colors"

export type ColorOverrides = Record<string, string>

export async function getColorOverrides(): Promise<ColorOverrides> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, KEY),
  })
  const raw = (row?.value ?? {}) as Record<string, unknown>
  const clean: ColorOverrides = {}
  for (const [slug, value] of Object.entries(raw)) {
    if (typeof value === "string" && isHexColor(value)) clean[slug] = value.toLowerCase()
  }
  return clean
}

export async function setColorOverride(slug: string, hex: string | null) {
  const current = await getColorOverrides()
  if (hex && isHexColor(hex)) current[slug] = hex.toLowerCase()
  else delete current[slug]

  await db
    .insert(appSettings)
    .values({ key: KEY, value: current, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: current, updatedAt: new Date() },
    })

  invalidateClientColors()
  setColorOverrides(current)
  return current
}

/**
 * Hydration with a short memo, for callers that are not the admin layout.
 *
 * The layout covers every admin *page*, but nothing else — API routes, cron
 * scripts and server actions all run outside it, and there `clientColor()`
 * would quietly fall back to the hardcoded defaults. That is a silent bug: the
 * colour is wrong but nothing errors. Anything server-side that resolves a
 * colour should await this first.
 */
const TTL_MS = 60_000
let memo: { at: number; value: ColorOverrides } | null = null

export async function ensureClientColors(now = Date.now()): Promise<ColorOverrides> {
  if (memo && now - memo.at < TTL_MS) {
    setColorOverrides(memo.value)
    return memo.value
  }
  const overrides = await getColorOverrides()
  memo = { at: now, value: overrides }
  setColorOverrides(overrides)
  return overrides
}

/** Drops the memo so a save is visible immediately rather than up to a minute later. */
export function invalidateClientColors() {
  memo = null
}

/**
 * Loads the overrides and pushes them into the module-level map that
 * `clientColor()` reads.
 *
 * This is what lets 73 existing call sites pick the change up without a single
 * edit: `clientColor(slug)` stays a pure synchronous function, and this hydrates
 * what it reads. Called from the admin layout, which wraps every admin page.
 */
export async function hydrateClientColors(): Promise<ColorOverrides> {
  return ensureClientColors()
}

/** Defaults plus overrides — what the settings page lists, and what ships to the browser. */
export async function resolvedColors(): Promise<ColorOverrides> {
  return { ...CLIENT_COLORS, ...(await getColorOverrides()) }
}
