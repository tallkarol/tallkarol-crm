import { NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema"
import { adminEmails } from "@/lib/crypto"
import { bearerFrom } from "@/lib/device-tokens"

/**
 * Auth for `/api/widget/*`. A macOS widget extension cannot hold a session
 * cookie and cannot run a sign-in, so it carries one static token from the
 * environment — the same idea as `SWEEP_SECRET`, with one difference that
 * matters: this token is quoted in a file on a laptop rather than typed once
 * into a Railway variable, so it is worth comparing in constant time.
 *
 * The comparison is over sha256 digests, never the raw strings, because
 * `timingSafeEqual` throws on a length mismatch — feeding it the tokens
 * directly would turn "wrong length" into an exception and leak the real
 * token's length to anyone probing.
 */

function digest(value: string) {
  return createHash("sha256").update(value).digest()
}

export function authenticateWidget(request: Request): boolean {
  const expected = process.env.WIDGET_TOKEN
  if (!expected) return false

  const token = bearerFrom(request)
  if (!token) return false

  return timingSafeEqual(digest(token), digest(expected))
}

/** One body for missing, malformed and wrong — a probe learns nothing. */
export function unauthorized() {
  return NextResponse.json(
    { error: "Send the widget token as `Authorization: Bearer <token>`." },
    { status: 401 }
  )
}

/**
 * Who a widget completion is attributed to.
 *
 * The token identifies a device, not a person, but `task_completions` rows are
 * worth attributing so the trail in the CRM is not full of anonymous ticks.
 * Falls back to any admin, then to null — a null is acceptable there and must
 * never cost you the completion itself.
 */
export async function widgetUserId(): Promise<string | null> {
  const [primary] = adminEmails()
  if (primary) {
    const owner = await db.query.users.findFirst({
      where: eq(users.email, primary),
      columns: { id: true },
    })
    if (owner) return owner.id
  }
  const admin = await db.query.users.findFirst({
    where: eq(users.role, "admin"),
    columns: { id: true },
  })
  return admin?.id ?? null
}
