import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"
import type { ModuleKey } from "@/lib/activity/define"
import { resolveFlags, type ModuleFlags } from "@/lib/activity/modules"

/**
 * The module switches (app_settings `activity`) and the ingest counters
 * (app_settings `activity_ingest`). Switches are read on every batch and
 * every action flush, so they are cached in-process for a minute; flipping
 * one clears this process's cache, and any other process catches up within
 * the minute.
 */

const FLAGS_KEY = "activity"
const INGEST_KEY = "activity_ingest"
const FLAGS_TTL_MS = 60_000

const store = globalThis as unknown as { __tk_activity_flags?: { at: number; flags: ModuleFlags } }

export async function activityFlags(now = Date.now()): Promise<ModuleFlags> {
  const cached = store.__tk_activity_flags
  if (cached && now - cached.at < FLAGS_TTL_MS) return cached.flags
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, FLAGS_KEY) })
  const value = (row?.value ?? {}) as { modules?: Record<string, unknown> }
  const flags = resolveFlags(value.modules)
  store.__tk_activity_flags = { at: now, flags }
  return flags
}

export async function setActivityFlag(key: ModuleKey, on: boolean): Promise<ModuleFlags> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, FLAGS_KEY) })
  const value = (row?.value ?? {}) as { modules?: Record<string, unknown> }
  const next = { ...value, modules: { ...(value.modules ?? {}), [key]: on } }
  await db
    .insert(appSettings)
    .values({ key: FLAGS_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } })
  store.__tk_activity_flags = undefined
  return resolveFlags(next.modules)
}

export type IngestStats = {
  dropped: number
  refused: number
  rateLimited: number
  lastDropped: string | null
  lastDroppedAt: string | null
}

export async function readIngestStats(): Promise<IngestStats> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, INGEST_KEY) })
  const v = (row?.value ?? {}) as Partial<IngestStats>
  return {
    dropped: Number(v.dropped) || 0,
    refused: Number(v.refused) || 0,
    rateLimited: Number(v.rateLimited) || 0,
    lastDropped: typeof v.lastDropped === "string" ? v.lastDropped : null,
    lastDroppedAt: typeof v.lastDroppedAt === "string" ? v.lastDroppedAt : null,
  }
}

/** Counters only move when something was turned away, so a clean batch costs no write. */
export async function bumpIngestStats(delta: { dropped: string[]; refused: number; rateLimited: number }, now = new Date()) {
  const dropped = delta.dropped.length
  if (!dropped && !delta.refused && !delta.rateLimited) return
  const last = dropped ? delta.dropped[dropped - 1] : null
  const initial: IngestStats = {
    dropped,
    refused: delta.refused,
    rateLimited: delta.rateLimited,
    lastDropped: last,
    lastDroppedAt: last ? now.toISOString() : null,
  }
  await db
    .insert(appSettings)
    .values({ key: INGEST_KEY, value: initial, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: sql`jsonb_build_object(
          'dropped', coalesce((${appSettings.value}->>'dropped')::int, 0) + ${dropped}::int,
          'refused', coalesce((${appSettings.value}->>'refused')::int, 0) + ${delta.refused}::int,
          'rateLimited', coalesce((${appSettings.value}->>'rateLimited')::int, 0) + ${delta.rateLimited}::int,
          'lastDropped', coalesce(${last}::text, ${appSettings.value}->>'lastDropped'),
          'lastDroppedAt', case when ${last}::text is null then ${appSettings.value}->>'lastDroppedAt' else ${now.toISOString()}::text end
        )`,
        updatedAt: now,
      },
    })
}
