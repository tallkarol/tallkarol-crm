import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"
import { currentSlot, isDue } from "@/lib/smartsheet-schedule"
import { syncSupportTickets } from "@/lib/smartsheet"
import { syncTracker } from "@/lib/smartsheet-tracker"

/**
 * Both Smartsheets, pulled together on a schedule. This only reads: the
 * tracker's write-back is a separate path, triggered by a change made here,
 * and is never fired by the clock.
 */

const STATE_KEY = "smartsheet_sync"

export type SyncState = {
  lastSlot: string | null
  lastRunAt: string | null
  lastOk: boolean
  lastSummary: string
}

export async function getSyncState(): Promise<SyncState> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, STATE_KEY),
  })
  const v = (row?.value ?? {}) as Partial<SyncState>
  return {
    lastSlot: typeof v.lastSlot === "string" ? v.lastSlot : null,
    lastRunAt: typeof v.lastRunAt === "string" ? v.lastRunAt : null,
    lastOk: v.lastOk !== false,
    lastSummary: typeof v.lastSummary === "string" ? v.lastSummary : "",
  }
}

async function saveSyncState(next: SyncState) {
  await db
    .insert(appSettings)
    .values({ key: STATE_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedAt: new Date() },
    })
}

export type SyncOutcome = {
  ok: boolean
  ran: boolean
  slot: string
  reason?: string
  support?: { ok: boolean; synced: number; error?: string }
  tracker?: { ok: boolean; synced: number; error?: string }
}

/**
 * Run both syncs if this hour opens a slot that has not been covered yet.
 * `force` skips that check for a sync by hand.
 *
 * A failure on one sheet does not stop the other, and only a clean run claims
 * the slot — so a sheet that was briefly unreachable is retried an hour later
 * rather than silently skipped until the next slot.
 */
export async function runScheduledSync(
  options: { force?: boolean; now?: Date } = {}
): Promise<SyncOutcome> {
  const now = options.now ?? new Date()
  const slot = currentSlot(now)
  const state = await getSyncState()

  if (!options.force && !isDue(now, state.lastSlot)) {
    return { ok: true, ran: false, slot, reason: "already synced this slot" }
  }

  const [support, tracker] = await Promise.all([
    syncSupportTickets().catch((err) => ({
      ok: false,
      synced: 0,
      error: err instanceof Error ? err.message : "Support sync threw.",
    })),
    syncTracker().catch((err) => ({
      ok: false,
      synced: 0,
      error: err instanceof Error ? err.message : "Tracker sync threw.",
    })),
  ])

  const ok = support.ok && tracker.ok
  const summary = `support ${support.ok ? `${support.synced} rows` : `failed — ${support.error}`}; tracker ${tracker.ok ? `${tracker.synced} projects` : `failed — ${tracker.error}`}`

  await saveSyncState({
    lastSlot: ok ? slot : state.lastSlot,
    lastRunAt: now.toISOString(),
    lastOk: ok,
    lastSummary: summary,
  })

  return {
    ok,
    ran: true,
    slot,
    support: { ok: support.ok, synced: support.synced, error: support.error },
    tracker: { ok: tracker.ok, synced: tracker.synced, error: tracker.error },
  }
}
