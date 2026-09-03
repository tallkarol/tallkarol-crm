"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { getSessionUser } from "@/lib/auth"
import { HIDE_MONEY_COOKIE } from "@/lib/money-privacy"
import { setGoals } from "@/lib/goals"
import { ROUTES } from "@/lib/nav"
import { isTheme, THEME_COOKIE } from "@/lib/theme"

function parseDollars(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").replace(/[$,]/g, "").trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

export async function saveGoals(formData: FormData) {
  await setGoals({
    monthlyCents: parseDollars(formData.get("monthly")),
    annualCents: parseDollars(formData.get("annual")),
  })
  revalidatePath(ROUTES.settings)
  revalidatePath(ROUTES.home)
}

/**
 * Demo mode: a cookie on this browser only. Mirrors `previewPortal` in
 * settings/portals/actions.ts. No revalidate — the toggle reloads the page,
 * which is the only way the inline script and chart formatters refresh.
 */
export async function setHideMoney(
  on: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Not signed in" }
  cookies().set(HIDE_MONEY_COOKIE, on ? "1" : "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: on ? 60 * 60 * 24 * 365 : 0,
  })
  return { ok: true }
}

/**
 * Appearance, per browser like demo mode. The toggle applies the choice to
 * the document itself, so no revalidate and no reload — the cookie only has
 * to be right for the next server render.
 */
export async function setTheme(
  theme: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Not signed in" }
  if (!isTheme(theme)) return { ok: false, error: "Unknown theme" }
  cookies().set(THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true }
}
