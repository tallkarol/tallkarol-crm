import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"

export type Goals = {
  monthlyCents: number | null
  annualCents: number | null
}

const KEY = "goals"

export async function getGoals(): Promise<Goals> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, KEY),
  })
  const v = (row?.value ?? {}) as Partial<Goals>
  return {
    monthlyCents: typeof v.monthlyCents === "number" ? v.monthlyCents : null,
    annualCents: typeof v.annualCents === "number" ? v.annualCents : null,
  }
}

export async function setGoals(goals: Goals) {
  await db
    .insert(appSettings)
    .values({ key: KEY, value: goals, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: goals, updatedAt: new Date() },
    })
}
