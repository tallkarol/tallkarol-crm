import { eq } from "drizzle-orm"
import { db } from "@/db"
import { reportCache } from "@/db/schema"

export type CachedReport<T> = {
  payload: T | null
  refreshedAt: Date | null
  lastError: string
}

export async function readReport<T>(key: string): Promise<CachedReport<T>> {
  const row = await db.query.reportCache.findFirst({
    where: eq(reportCache.key, key),
  })
  if (!row) return { payload: null, refreshedAt: null, lastError: "" }
  return {
    payload: row.payload as T,
    refreshedAt: row.refreshedAt,
    lastError: row.lastError,
  }
}

export async function writeReport(
  key: string,
  payload: unknown,
  lastError = ""
) {
  const refreshedAt = new Date()
  await db
    .insert(reportCache)
    .values({ key, payload, refreshedAt, lastError })
    .onConflictDoUpdate({
      target: reportCache.key,
      set: { payload, refreshedAt, lastError },
    })
  return refreshedAt
}
