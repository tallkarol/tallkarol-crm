"use server"

import { revalidatePath } from "next/cache"
import { isHexColor } from "@/lib/client-colors"
import { setColorOverride } from "@/lib/client-colors-store"

type Result = { ok: true } | { ok: false; error: string }

/**
 * Saves one accent. An empty value clears the override and restores the
 * default rather than storing a blank, so "reset" needs no separate action.
 */
export async function saveClientColor(slug: string, hex: string): Promise<Result> {
  const trimmed = hex.trim()
  if (trimmed && !isHexColor(trimmed)) {
    return { ok: false, error: "Use a six-digit hex colour, like #3A5FA8." }
  }

  await setColorOverride(slug, trimmed || null)

  // Accents appear on nearly every surface, so this clears the lot rather than
  // leaving a stale colour on whichever page happens to be cached.
  revalidatePath("/", "layout")
  return { ok: true }
}
