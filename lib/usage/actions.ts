"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { usageSnapshots } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { workspaceTimezone } from "@/lib/timezone"
import { pace } from "@/lib/usage/summary"
import { FUTURE_TOLERANCE_MS, wallClockToInstant } from "@/lib/usage/time"

/**
 * A reading Karol types from a dashboard the CRM cannot read itself: what
 * /usage inside Claude Code shows, or cursor.com → Usage. Stored as a
 * usage_snapshots row with basis 'manual', the same shape a poller would
 * write, so the tile never changes if polling is switched on later. A
 * Claude reading also stores the token pace at that instant — the pair that
 * lets him see, over weeks, roughly how many output tokens a window holds.
 */

export type ReadingResult = { ok: true } | { ok: false; error: string }

function pctField(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim().replace("%", "")
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
}

function moneyField(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim().replace(/[$,]/g, "")
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, n) : null
}

function textField(formData: FormData, key: string, max = 80): string {
  return String(formData.get(key) ?? "").trim().slice(0, max)
}

/**
 * The "as of" box is a wall clock with no zone. It means the workspace zone
 * — the zone the page prints everything in — not the server's, which on
 * Railway is UTC and would date every reading two hours ahead.
 */
function observedAt(formData: FormData, tz: string): Date | { error: string } {
  const raw = textField(formData, "observedAt", 40)
  if (!raw) return new Date()
  const d = wallClockToInstant(raw, tz)
  if (!d) return { error: "The as-of time did not parse." }
  if (d.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return { error: "The as-of time is in the future." }
  return d
}

export async function recordReading(formData: FormData): Promise<ReadingResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const source = textField(formData, "source", 40)
  const tz = await workspaceTimezone().catch(() => "Europe/Warsaw")
  const at = observedAt(formData, tz)
  if (!(at instanceof Date)) return { ok: false, error: at.error }

  let payload: Record<string, unknown>
  if (source === "claude_max") {
    const fiveHour = pctField(formData, "five_hour_pct")
    const sevenDay = pctField(formData, "seven_day_pct")
    if (fiveHour === null && sevenDay === null) return { ok: false, error: "Type at least one of the two percents." }
    const p = await pace(at)
    payload = {
      five_hour_pct: fiveHour,
      seven_day_pct: sevenDay,
      resets_5h: textField(formData, "resets_5h"),
      resets_7d: textField(formData, "resets_7d"),
      pace: {
        h5: { output: p.h5.output, requests: p.h5.requests, cache_read: p.h5.cacheRead, hours: p.h5.hours, turns: p.h5.turns },
        d7: { output: p.d7.output, requests: p.d7.requests, cache_read: p.d7.cacheRead, hours: p.d7.hours, turns: p.d7.turns },
      },
    }
  } else if (source === "cursor_dashboard") {
    const otherUsd = moneyField(formData, "other_models_usd")
    const planPct = pctField(formData, "plan_pct")
    if (otherUsd === null && planPct === null) return { ok: false, error: "Type the Other-models dollars or the plan percent." }
    payload = {
      plan_pct: planPct,
      cursor_models_pct: pctField(formData, "cursor_models_pct"),
      other_models_usd: otherUsd,
      other_models_pool_usd: moneyField(formData, "other_models_pool_usd"),
      other_models_pct: pctField(formData, "other_models_pct"),
      on_demand_usd: moneyField(formData, "on_demand_usd"),
      cycle_end: textField(formData, "cycle_end", 20),
    }
  } else {
    return { ok: false, error: "Pick Claude Max or the Cursor dashboard." }
  }

  await db
    .insert(usageSnapshots)
    .values({
      source,
      basis: "manual",
      observedAt: at,
      payload,
      note: "typed from /usage",
    })
    .onConflictDoNothing({ target: [usageSnapshots.source, usageSnapshots.observedAt] })
  revalidatePath(ROUTES.usage)
  return { ok: true }
}
