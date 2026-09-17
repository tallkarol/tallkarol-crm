"use server"

import { revalidatePath } from "next/cache"
import { getSessionUser } from "@/lib/auth"
import { isModuleKey, moduleByKey } from "@/lib/activity/modules"
import { setActivityFlag } from "@/lib/activity/settings"
import { ROUTES } from "@/lib/nav"
import { tracked } from "@/lib/activity/tracked"

/** Flip one module. Admin only; a module with nothing to switch on stays off. */
export const toggleActivityModule = tracked("activity.toggleActivityModule", async function toggleActivityModule(key: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!isModuleKey(key)) return { ok: false, error: "That module does not exist." }
  if (!moduleByKey(key).available) return { ok: false, error: `${moduleByKey(key).label} is not built yet, so there is nothing to switch on.` }
  await setActivityFlag(key, on)
  revalidatePath(ROUTES.activity)
  return { ok: true }
})
