import { routeMatcher } from "@/lib/activity/catalog"
import { MAX_BATCH, cleanEnvelope, sanitizeEvent } from "@/lib/activity/sanitize"
import { activityFlags, bumpIngestStats } from "@/lib/activity/settings"
import { attributeSessions, insertEvents, type StoredRow } from "@/lib/activity/store"
import { hashToken } from "@/lib/crypto"

/**
 * One browser batch → rows. The session cookie decides who it is (customers
 * included — the portal is recorded), the registry decides what may be kept,
 * and the module switches decide whether it is kept at all.
 */

/** Generous for a person, tight for a loop gone wrong. */
export const RATE_LIMIT = { windowMs: 5 * 60_000, maxEvents: 1500 }

const limiter = globalThis as unknown as { __tk_activity_rate?: Map<string, { start: number; count: number }> }

export function takeRate(key: string, wanted: number, now: number): number {
  const map = (limiter.__tk_activity_rate ??= new Map())
  let entry = map.get(key)
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    entry = { start: now, count: 0 }
    map.set(key, entry)
  }
  const granted = Math.max(0, Math.min(RATE_LIMIT.maxEvents - entry.count, wanted))
  entry.count += granted
  if (map.size > 1000) map.clear()
  return granted
}

export type IngestResult = { status: 204 | 400 | 401; stored: number; dropped: number; refused: number; rateLimited: number }

export async function ingestBatch(
  body: unknown,
  request: { userAgent: string; sessionToken: string | undefined },
  now = new Date()
): Promise<IngestResult> {
  const empty = { stored: 0, dropped: 0, refused: 0, rateLimited: 0 }
  if (!request.sessionToken) return { status: 401, ...empty }
  if (!body || typeof body !== "object" || !Array.isArray((body as { events?: unknown }).events)) {
    return { status: 400, ...empty }
  }
  const b = body as Record<string, unknown> & { events: unknown[] }

  const tokenHash = hashToken(request.sessionToken)
  const who = (await attributeSessions([tokenHash], now)).get(tokenHash)
  if (!who) return { status: 401, ...empty }

  const flags = await activityFlags(now.getTime())
  if (who.role === "customer" && !flags.portal) return { status: 204, ...empty }

  const envelope = cleanEnvelope(b, request.userAgent)
  const offered = b.events.slice(0, MAX_BATCH)
  let refused = b.events.length - offered.length
  const granted = takeRate(`${who.userId}:${envelope.session}`, offered.length, now.getTime())
  const rateLimited = offered.length - granted

  const match = routeMatcher()
  const dropped: string[] = []
  const rows: StoredRow[] = []
  offered.slice(0, granted).forEach((raw) => {
    const result = sanitizeEvent(raw, { now, from: "browser", match })
    result.dropped.forEach((d) => dropped.push(d))
    if (!result.event) {
      refused += 1
      return
    }
    if (!flags[result.event.module]) return
    rows.push({ event: result.event, envelope, who })
  })

  const stored = await insertEvents(rows)
  await bumpIngestStats({ dropped, refused, rateLimited }, now).catch(() => undefined)
  return { status: 204, stored, dropped: dropped.length, refused, rateLimited }
}
