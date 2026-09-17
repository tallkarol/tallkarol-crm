import { and, eq, gt, inArray } from "drizzle-orm"
import { db } from "@/db"
import { activityEvents, portalGrants, sessions, users } from "@/db/schema"
import type { BatchEnvelope, CleanEvent } from "@/lib/activity/sanitize"

/**
 * Writing events: who they belong to, and the insert. Shared by the browser
 * ingest route and the server's tracked() buffer.
 */

export type Attribution = { userId: string; role: "admin" | "customer"; clientId: string | null }

/** Railway sets the commit for GitHub deploys; a `railway up` has only its deployment id. */
export function deployId(): string {
  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").slice(0, 7)
  const deployment = (process.env.RAILWAY_DEPLOYMENT_ID ?? "").slice(0, 8)
  return sha || deployment || "local"
}

const ATTRIBUTION_TTL_MS = 60_000
const cache = globalThis as unknown as { __tk_activity_who?: Map<string, { at: number; who: Attribution | null }> }

/**
 * Session token hashes → user, role and (for a customer holding exactly one
 * portal grant) client. At most two queries for a whole batch, and a minute
 * of in-process memory so a busy tab is not a query per beacon.
 */
export async function attributeSessions(tokenHashes: string[], now = new Date()): Promise<Map<string, Attribution | null>> {
  const memo = (cache.__tk_activity_who ??= new Map())
  const out = new Map<string, Attribution | null>()
  const missing: string[] = []
  for (const hash of Array.from(new Set(tokenHashes.filter(Boolean)))) {
    const hit = memo.get(hash)
    if (hit && now.getTime() - hit.at < ATTRIBUTION_TTL_MS) out.set(hash, hit.who)
    else missing.push(hash)
  }
  if (!missing.length) return out

  const rows = await db
    .select({ tokenHash: sessions.tokenHash, userId: users.id, role: users.role, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(inArray(sessions.tokenHash, missing), gt(sessions.expiresAt, now)))

  const customerEmails = rows.filter((r) => r.role === "customer").map((r) => r.email.toLowerCase())
  const clientByEmail = new Map<string, string | null>()
  if (customerEmails.length) {
    const grants = await db
      .select({ email: portalGrants.email, clientId: portalGrants.clientId })
      .from(portalGrants)
      .where(inArray(portalGrants.email, customerEmails))
    const byEmail = new Map<string, Set<string>>()
    grants.forEach((g) => {
      const key = g.email.toLowerCase()
      const set = byEmail.get(key) ?? new Set<string>()
      set.add(g.clientId)
      byEmail.set(key, set)
    })
    byEmail.forEach((set, email) => clientByEmail.set(email, set.size === 1 ? Array.from(set)[0] : null))
  }

  const found = new Set<string>()
  rows.forEach((r) => {
    const customer = r.role === "customer"
    const who: Attribution = {
      userId: r.userId,
      role: customer ? "customer" : "admin",
      clientId: customer ? clientByEmail.get(r.email.toLowerCase()) ?? null : null,
    }
    found.add(r.tokenHash)
    out.set(r.tokenHash, who)
    memo.set(r.tokenHash, { at: now.getTime(), who })
  })
  missing.forEach((hash) => {
    if (found.has(hash)) return
    out.set(hash, null)
    memo.set(hash, { at: now.getTime(), who: null })
  })
  if (memo.size > 500) memo.clear()
  return out
}

export type StoredRow = { event: CleanEvent; envelope: BatchEnvelope; who: Attribution }

export async function insertEvents(rows: StoredRow[]): Promise<number> {
  if (!rows.length) return 0
  const deploy = deployId()
  const values = rows.map(({ event, envelope, who }) => ({
    occurredAt: event.occurredAt,
    userId: who.userId,
    role: who.role,
    clientId: who.clientId,
    session: envelope.session,
    surface: envelope.surface,
    viewport: envelope.viewport,
    module: event.module,
    kind: event.kind,
    route: event.route,
    target: event.target,
    durationMs: event.durationMs,
    ok: event.ok,
    props: event.props,
    deploy,
    synthetic: envelope.synthetic,
  }))
  for (let i = 0; i < values.length; i += 200) {
    await db.insert(activityEvents).values(values.slice(i, i + 200))
  }
  return values.length
}
