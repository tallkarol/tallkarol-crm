import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { eq, isNull, and } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { db } from "@/db"
import { appSources, type AppSource } from "@/db/schema"

/**
 * Every wired app authenticates with its own key: `tk_<slug>.<secret>`.
 *
 * The dot matters: the secret is base64url, which contains `_` and `-`, and so
 * do slugs — a `_` separator can't be split back apart unambiguously.
 *
 * The slug picks the row, the secret is compared against a stored hash, and the
 * row — not the request body — decides which client the data belongs to. A key
 * that leaks can only ever file against its own client, and a key that stops
 * being seen is itself worth noticing (`lastSeenAt`).
 */

export type Scope = "tickets" | "runs" | "events"

export function newAppKey(slug: string) {
  const secret = randomBytes(24).toString("base64url")
  return { key: `tk_${slug}.${secret}`, secretHash: hashSecret(secret) }
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex")
}

function parseKey(raw: string) {
  const value = raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim()
  if (!value.startsWith("tk_")) return null
  const rest = value.slice(3)
  const cut = rest.indexOf(".")
  if (cut <= 0 || cut === rest.length - 1) return null
  return { slug: rest.slice(0, cut), secret: rest.slice(cut + 1) }
}

function sameHash(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export type AuthResult =
  | { ok: true; source: AppSource }
  | { ok: false; status: number; error: string }

/** Resolve the app behind a request, or say why not. */
export async function authenticateApp(
  request: NextRequest,
  scope: Scope
): Promise<AuthResult> {
  const header = request.headers.get("authorization") || ""
  const parsed = parseKey(header)
  if (!parsed) return { ok: false, status: 401, error: "Missing or malformed app key" }

  const source = await db.query.appSources.findFirst({
    where: and(eq(appSources.slug, parsed.slug), isNull(appSources.revokedAt)),
  })
  if (!source) return { ok: false, status: 401, error: "Unknown or revoked app key" }
  if (!sameHash(source.secretHash, hashSecret(parsed.secret))) {
    return { ok: false, status: 401, error: "Unknown or revoked app key" }
  }
  if (!source.scopes.includes(scope)) {
    return { ok: false, status: 403, error: `This key cannot post ${scope}` }
  }

  // Fire and forget: a stale heartbeat is worth seeing, a slow write isn't.
  void db
    .update(appSources)
    .set({ lastSeenAt: new Date() })
    .where(eq(appSources.id, source.id))
    .catch(() => {})

  return { ok: true, source }
}
