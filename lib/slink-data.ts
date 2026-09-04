import { randomBytes } from "crypto"
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  slinkAccessRequests,
  slinkBlocks,
  slinkEvents,
  slinkFiles,
  slinkRecipients,
  slinkSessions,
  slinkTokens,
  slinks,
} from "@/db/schema"
import { hashToken, newToken } from "@/lib/crypto"
import {
  SLINK_RULES,
  grantAllows,
  grantState,
  makePublicId,
  normalizeEmail,
  sessionExpiry,
  tokenExpiry,
  tokenUsable,
  type SlinkEventKind,
} from "@/lib/slink"

/**
 * slink — the db half.
 *
 * Every read a recipient makes goes through `authorize()`, which is the only
 * place that decides whether an address may see a page. It checks the session,
 * then the grant behind it, in that order and on every request — a grant that
 * lapses mid-session locks the next page load, rather than waiting for a cookie
 * to expire on its own.
 */

export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/* ------------------------------------------------------------------ events */

export async function logEvent(
  input: {
    slinkId: string
    recipientId?: string | null
    kind: SlinkEventKind
    detail?: string
    ip?: string
    userAgent?: string
  },
  client: Executor = db
) {
  await client.insert(slinkEvents).values({
    slinkId: input.slinkId,
    recipientId: input.recipientId ?? null,
    kind: input.kind,
    detail: (input.detail ?? "").slice(0, 500),
    ip: (input.ip ?? "").slice(0, 90),
    userAgent: (input.userAgent ?? "").slice(0, 300),
  })
}

/* ------------------------------------------------------------------ slinks */

export async function createSlink(
  input: { title: string; intro?: string; clientId?: string | null; userId: string | null },
  client: Executor = db
) {
  const title = input.title.trim().slice(0, SLINK_RULES.maxTitle)
  if (!title) throw new Error("A slink needs a title.")
  const publicId = makePublicId((n) => new Uint8Array(randomBytes(n)), title.split(/\s+/).slice(0, 3))
  const [row] = await client
    .insert(slinks)
    .values({
      publicId,
      title,
      intro: (input.intro ?? "").slice(0, SLINK_RULES.maxIntro),
      clientId: input.clientId || null,
      createdBy: input.userId,
    })
    .returning({ id: slinks.id, publicId: slinks.publicId })
  await logEvent({ slinkId: row.id, kind: "created", detail: title }, client)
  return row
}

export async function slinkByPublicId(publicId: string, client: Executor = db) {
  return client.query.slinks.findFirst({ where: eq(slinks.publicId, publicId) })
}

/* -------------------------------------------------------------- recipients */

/**
 * Invite, or re-share with someone whose grant lapsed. One row per address per
 * slink, so re-sharing updates the grant it already has and keeps the history
 * attached to that person rather than starting a second trail.
 */
export async function upsertRecipient(
  input: {
    slinkId: string
    email: string
    name?: string
    expiresAt: Date | null
    invitedBy: string | null
  },
  client: Executor = db
) {
  const email = normalizeEmail(input.email)
  const [row] = await client
    .insert(slinkRecipients)
    .values({
      slinkId: input.slinkId,
      email,
      name: (input.name ?? "").slice(0, 160),
      expiresAt: input.expiresAt,
      invitedBy: input.invitedBy,
    })
    .onConflictDoUpdate({
      target: [slinkRecipients.slinkId, slinkRecipients.email],
      set: {
        expiresAt: input.expiresAt,
        revokedAt: null,
        name: sql`case when excluded.name <> '' then excluded.name else ${slinkRecipients.name} end`,
      },
    })
    .returning({ id: slinkRecipients.id, email: slinkRecipients.email })
  return row
}

export async function setGrant(
  recipientId: string,
  expiresAt: Date | null,
  client: Executor = db
) {
  const [row] = await client
    .update(slinkRecipients)
    .set({ expiresAt, revokedAt: null })
    .where(eq(slinkRecipients.id, recipientId))
    .returning({ id: slinkRecipients.id, slinkId: slinkRecipients.slinkId })
  return row
}

/**
 * Revoking kills the sessions too. Without that, a revoked person keeps
 * reading until their cookie happens to expire.
 */
export async function revokeRecipient(recipientId: string, client: Executor = db) {
  const [row] = await client
    .update(slinkRecipients)
    .set({ revokedAt: new Date() })
    .where(eq(slinkRecipients.id, recipientId))
    .returning({ id: slinkRecipients.id, slinkId: slinkRecipients.slinkId })
  await client.delete(slinkSessions).where(eq(slinkSessions.recipientId, recipientId))
  if (row) await logEvent({ slinkId: row.slinkId, recipientId, kind: "revoked" }, client)
  return row
}

export async function listRecipients(slinkId: string, client: Executor = db) {
  return client.query.slinkRecipients.findMany({
    where: eq(slinkRecipients.slinkId, slinkId),
    orderBy: [desc(slinkRecipients.invitedAt)],
  })
}

/* ------------------------------------------------------------------ tokens */

/**
 * Mint a single-use magic link. Returns the raw token exactly once — only its
 * hash is stored, so a database read can never reconstruct a working link.
 */
export async function issueToken(recipientId: string, client: Executor = db) {
  const token = newToken(32)
  const now = new Date()
  await client.insert(slinkTokens).values({
    recipientId,
    tokenHash: hashToken(token),
    expiresAt: tokenExpiry(now),
  })
  return token
}

export type ExchangeResult =
  | { ok: true; recipientId: string; slinkId: string; session: string; expiresAt: Date }
  | { ok: false; reason: "unknown" | "used" | "expired" | "revoked" | "lapsed" }

/**
 * Trade a magic link for a session. Single use: `used_at` is stamped in the
 * same statement that claims it, so two clicks on the same link cannot both
 * win. The grant is re-checked here, not just at invite time.
 */
export async function exchangeToken(
  raw: string,
  now = new Date(),
  client: Executor = db
): Promise<ExchangeResult> {
  const rows = (await client.execute(sql`
    update slink_tokens
       set used_at = ${now.toISOString()}::timestamptz
     where token_hash = ${hashToken(raw)}
       and used_at is null
       and expires_at > ${now.toISOString()}::timestamptz
    returning recipient_id
  `)) as unknown as { recipient_id: string }[]

  if (!rows.length) {
    const seen = await client.query.slinkTokens.findFirst({
      where: eq(slinkTokens.tokenHash, hashToken(raw)),
      columns: { usedAt: true },
    })
    return { ok: false, reason: seen ? (seen.usedAt ? "used" : "expired") : "unknown" }
  }

  const recipientId = rows[0].recipient_id
  const recipient = await client.query.slinkRecipients.findFirst({
    where: eq(slinkRecipients.id, recipientId),
  })
  if (!recipient) return { ok: false, reason: "unknown" }
  if (recipient.revokedAt) return { ok: false, reason: "revoked" }
  if (!grantAllows(recipient, now)) return { ok: false, reason: "lapsed" }

  const session = newToken(32)
  const expiresAt = sessionExpiry(recipient, now)
  await client.insert(slinkSessions).values({
    recipientId,
    tokenHash: hashToken(session),
    expiresAt,
  })
  await client
    .update(slinkRecipients)
    .set({ lastSeenAt: now, viewCount: sql`${slinkRecipients.viewCount} + 1` })
    .where(eq(slinkRecipients.id, recipientId))

  return { ok: true, recipientId, slinkId: recipient.slinkId, session, expiresAt }
}

/* ---------------------------------------------------------------- sessions */

export type Authorized = {
  recipient: typeof slinkRecipients.$inferSelect
  slink: typeof slinks.$inferSelect
}

/**
 * The one gate. A cookie alone proves nothing: the grant behind it is checked
 * on every request, so revoking or letting a grant lapse takes effect on the
 * next page load rather than whenever the cookie happens to die.
 */
export async function authorize(
  publicId: string,
  sessionToken: string | undefined,
  now = new Date(),
  client: Executor = db
): Promise<Authorized | null> {
  if (!sessionToken) return null
  const slink = await slinkByPublicId(publicId, client)
  if (!slink || slink.status !== "active") return null

  const rows = await client
    .select({ recipient: slinkRecipients })
    .from(slinkSessions)
    .innerJoin(slinkRecipients, eq(slinkSessions.recipientId, slinkRecipients.id))
    .where(
      and(
        eq(slinkSessions.tokenHash, hashToken(sessionToken)),
        gt(slinkSessions.expiresAt, now),
        eq(slinkRecipients.slinkId, slink.id),
        isNull(slinkRecipients.revokedAt)
      )
    )
    .limit(1)

  const recipient = rows[0]?.recipient
  if (!recipient || !grantAllows(recipient, now)) return null
  return { recipient, slink }
}

export async function endSession(sessionToken: string, client: Executor = db) {
  await client.delete(slinkSessions).where(eq(slinkSessions.tokenHash, hashToken(sessionToken)))
}

/* ------------------------------------------------------------------ blocks */

export async function listBlocks(slinkId: string, client: Executor = db) {
  return client.query.slinkBlocks.findMany({
    where: eq(slinkBlocks.slinkId, slinkId),
    orderBy: [slinkBlocks.position],
  })
}

export async function addBlock(
  input: {
    slinkId: string
    kind: string
    title?: string
    note?: string
    data?: unknown
    secretBlob?: string
    sourceKind?: string
    sourceId?: string | null
  },
  client: Executor = db
) {
  const [{ next }] = (await client.execute(sql`
    select coalesce(max(position), -1) + 1 as next from slink_blocks where slink_id = ${input.slinkId}
  `)) as unknown as { next: number }[]
  const [row] = await client
    .insert(slinkBlocks)
    .values({
      slinkId: input.slinkId,
      position: Number(next) || 0,
      kind: input.kind,
      title: (input.title ?? "").slice(0, 200),
      note: (input.note ?? "").slice(0, 2000),
      data: (input.data ?? {}) as Record<string, unknown>,
      secretBlob: input.secretBlob ?? "",
      sourceKind: input.sourceKind ?? "",
      sourceId: input.sourceId ?? null,
    })
    .returning({ id: slinkBlocks.id })
  await client.update(slinks).set({ updatedAt: new Date() }).where(eq(slinks.id, input.slinkId))
  return row
}

export async function deleteBlock(blockId: string, client: Executor = db) {
  await client.delete(slinkBlocks).where(eq(slinkBlocks.id, blockId))
}

export async function moveBlock(blockId: string, direction: -1 | 1, client: Executor = db) {
  const block = await client.query.slinkBlocks.findFirst({ where: eq(slinkBlocks.id, blockId) })
  if (!block) return
  const siblings = await listBlocks(block.slinkId, client)
  const index = siblings.findIndex((b) => b.id === blockId)
  const swapWith = siblings[index + direction]
  if (!swapWith) return
  await client
    .update(slinkBlocks)
    .set({ position: swapWith.position })
    .where(eq(slinkBlocks.id, block.id))
  await client
    .update(slinkBlocks)
    .set({ position: block.position })
    .where(eq(slinkBlocks.id, swapWith.id))
}

/* ------------------------------------------------------------------- files */

export async function addFile(
  input: { slinkId: string; blockId?: string | null; name: string; mime: string; data: Buffer },
  client: Executor = db
) {
  const [row] = await client
    .insert(slinkFiles)
    .values({
      slinkId: input.slinkId,
      blockId: input.blockId ?? null,
      name: input.name.slice(0, 260),
      mime: input.mime.slice(0, 160),
      bytes: input.data.length,
      data: input.data,
    })
    .returning({ id: slinkFiles.id })
  return row
}

export async function listFiles(slinkId: string, client: Executor = db) {
  return client.query.slinkFiles.findMany({
    where: eq(slinkFiles.slinkId, slinkId),
    columns: { id: true, name: true, mime: true, bytes: true, blockId: true, createdAt: true },
  })
}

export async function readFile(fileId: string, slinkId: string, client: Executor = db) {
  return client.query.slinkFiles.findFirst({
    where: and(eq(slinkFiles.id, fileId), eq(slinkFiles.slinkId, slinkId)),
  })
}

/* --------------------------------------------------------- access requests */

export async function fileAccessRequest(
  input: {
    slinkId: string
    email: string
    name?: string
    reason?: string
    requestedBy?: string | null
    ip?: string
  },
  client: Executor = db
) {
  const email = normalizeEmail(input.email)
  const [row] = await client
    .insert(slinkAccessRequests)
    .values({
      slinkId: input.slinkId,
      email,
      name: (input.name ?? "").slice(0, 160),
      reason: (input.reason ?? "").slice(0, SLINK_RULES.maxReason),
      requestedBy: input.requestedBy ?? null,
      ip: (input.ip ?? "").slice(0, 90),
    })
    .returning({ id: slinkAccessRequests.id })
  await logEvent(
    { slinkId: input.slinkId, kind: "access_requested", detail: email, ip: input.ip },
    client
  )
  return row
}

export async function pendingRequests(slinkId: string, client: Executor = db) {
  return client.query.slinkAccessRequests.findMany({
    where: and(
      eq(slinkAccessRequests.slinkId, slinkId),
      eq(slinkAccessRequests.status, "pending")
    ),
    orderBy: [desc(slinkAccessRequests.createdAt)],
  })
}

export async function decideRequest(
  requestId: string,
  status: "granted" | "denied",
  userId: string | null,
  client: Executor = db
) {
  const [row] = await client
    .update(slinkAccessRequests)
    .set({ status, decidedAt: new Date(), decidedBy: userId })
    .where(eq(slinkAccessRequests.id, requestId))
    .returning({
      id: slinkAccessRequests.id,
      slinkId: slinkAccessRequests.slinkId,
      email: slinkAccessRequests.email,
      name: slinkAccessRequests.name,
    })
  return row
}

/**
 * How many requests this IP has filed against this slink in the last hour.
 * Counted on the row rather than in memory, because Railway restarts and an
 * in-process counter would forget every deploy.
 */
export async function recentRequestCount(
  slinkId: string,
  ip: string,
  now = new Date(),
  client: Executor = db
) {
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const rows = (await client.execute(sql`
    select count(*)::int as n from slink_access_requests
     where slink_id = ${slinkId} and ip = ${ip} and created_at > ${since}::timestamptz
  `)) as unknown as { n: number }[]
  return rows[0]?.n ?? 0
}

/* ------------------------------------------------------------------- reads */

export async function listSlinks(client: Executor = db) {
  return client.query.slinks.findMany({
    orderBy: [desc(slinks.updatedAt)],
    with: { client: { columns: { id: true, name: true, slug: true } } },
  })
}

export async function listEvents(slinkId: string, limit = 40, client: Executor = db) {
  return client.query.slinkEvents.findMany({
    where: eq(slinkEvents.slinkId, slinkId),
    orderBy: [desc(slinkEvents.at)],
    limit,
    with: { recipient: { columns: { email: true } } },
  })
}

/** Marks lapsed grants in the log so the trail explains a locked-out person. */
export async function sweepExpiredGrants(now = new Date(), client: Executor = db) {
  const rows = (await client.execute(sql`
    insert into slink_events (slink_id, recipient_id, kind, detail)
    select r.slink_id, r.id, 'expired', r.email
      from slink_recipients r
     where r.expires_at is not null
       and r.expires_at <= ${now.toISOString()}::timestamptz
       and r.revoked_at is null
       and not exists (
         select 1 from slink_events e
          where e.recipient_id = r.id and e.kind = 'expired'
            and e.at > r.expires_at
       )
    returning id
  `)) as unknown as { id: string }[]
  await client.execute(sql`
    delete from slink_sessions s
     using slink_recipients r
     where s.recipient_id = r.id
       and (r.revoked_at is not null
            or (r.expires_at is not null and r.expires_at <= ${now.toISOString()}::timestamptz))
  `)
  return { expired: rows.length }
}

export { grantState }
