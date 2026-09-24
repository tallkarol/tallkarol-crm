import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { deviceTokens, users } from "@/db/schema"
import type { User } from "@/db/schema"
import { hashToken, newToken } from "@/lib/crypto"

/**
 * Bearer auth for `/api/time/*`. The browser session cookie cannot reach a
 * watch, and one shared secret cannot be revoked for a single person — so
 * every device gets its own token, hashed at rest like a magic link.
 */

export type DeviceAuth = { user: User; deviceId: string }

/** How old a device's last-used stamp may be before a call refreshes it. */
const STAMP_EVERY_MS = 60_000

export function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization") || ""
  if (!header.toLowerCase().startsWith("bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

/**
 * Resolves a bearer token to its owner and stamps last-used. Returns null for
 * a missing, unknown, or revoked token — callers answer 401 either way, so a
 * probe cannot tell the difference.
 */
export async function authenticateDevice(
  request: Request
): Promise<DeviceAuth | null> {
  const token = bearerFrom(request)
  if (!token) return null

  const [row] = await db
    .select({ device: deviceTokens, user: users })
    .from(deviceTokens)
    .innerJoin(users, eq(deviceTokens.userId, users.id))
    .where(
      and(eq(deviceTokens.tokenHash, hashToken(token)), isNull(deviceTokens.revokedAt))
    )
    .limit(1)

  if (!row) return null
  if (row.user.role !== "admin") return null

  // Stamp last-used at most once a minute per device. Every call used to
  // write it: 706k updates in twelve days, a quarter of all the time the
  // database spent on anything, for a value the devices page shows as
  // "4m ago". The row just read carries the last stamp, so the check costs
  // nothing and holds across processes. Best-effort: a failed stamp must
  // never cost someone their clock-in.
  const lastUsed = row.device.lastUsedAt?.getTime() ?? 0
  if (Date.now() - lastUsed >= STAMP_EVERY_MS) {
    void db
      .update(deviceTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(deviceTokens.id, row.device.id))
      .catch(() => {})
  }

  return { user: row.user, deviceId: row.device.id }
}

export async function listDeviceTokens(userId: string) {
  return db.query.deviceTokens.findMany({
    where: eq(deviceTokens.userId, userId),
    orderBy: [desc(deviceTokens.createdAt)],
  })
}

/** Returns the plaintext token exactly once — it is never recoverable after. */
export async function issueDeviceToken(userId: string, name: string) {
  const token = newToken()
  const [row] = await db
    .insert(deviceTokens)
    .values({ userId, name: name.trim() || "Device", tokenHash: hashToken(token) })
    .returning({ id: deviceTokens.id, name: deviceTokens.name })
  return { id: row.id, name: row.name, token }
}

export async function revokeDeviceToken(userId: string, id: string) {
  await db
    .update(deviceTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(deviceTokens.id, id), eq(deviceTokens.userId, userId)))
}
