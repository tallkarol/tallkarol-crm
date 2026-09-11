import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"

/**
 * How the dock opens a desk. `continue` picks up the desk's latest thread on
 * that pack — continuity is the point of a desk; `new` starts a fresh thread
 * every time, with the last digest still shown so nothing is forgotten.
 * One row in app_settings, edited from Settings.
 */
const KEY = "chat_dock"

export type DockOpenMode = "continue" | "new"
export type DockSettings = { open: DockOpenMode }

export async function dockSettings(): Promise<DockSettings> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) })
  const value = (row?.value ?? {}) as Partial<DockSettings>
  return { open: value.open === "new" ? "new" : "continue" }
}

export async function setDockSettings(next: DockSettings) {
  await db
    .insert(appSettings)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next } })
}
