"use server"

import { revalidatePath } from "next/cache"
import { setGoals } from "@/lib/goals"
import { ROUTES } from "@/lib/nav"

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
