import { cookies } from "next/headers"
import { eq, and, gt, isNull } from "drizzle-orm"
import { db } from "@/db"
import { magicLinks, sessions, users } from "@/db/schema"
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  MAGIC_LINK_TTL_MS,
  hashToken,
  newToken,
  isAdminEmail,
} from "@/lib/crypto"
import { Resend } from "resend"

export async function requestMagicLink(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: true as const }
  }

  // Always return the same shape — do not leak allowlist membership.
  if (!isAdminEmail(email)) {
    return { ok: true as const }
  }

  const token = newToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS)

  await db.insert(magicLinks).values({
    email,
    tokenHash,
    expiresAt,
  })

  const appUrl = process.env.APP_URL || "http://localhost:3001"
  const link = `${appUrl}/auth/callback?token=${token}`
  const from = process.env.RESEND_FROM_EMAIL || "hello@tallkarol.com"
  const key = process.env.RESEND_API_KEY

  if (!key) {
    console.error("RESEND_API_KEY missing — magic link not sent")
    // In local/dev without Resend, log the link so you can still sign in.
    if (process.env.NODE_ENV !== "production") {
      console.log("[dev] magic link:", link)
    }
    return { ok: true as const }
  }

  const resend = new Resend(key)
  const { error } = await resend.emails.send({
    from: `Tall Karol CRM <${from}>`,
    to: email,
    subject: "Your Tall Karol CRM sign-in link",
    text: `Sign in to the CRM:\n\n${link}\n\nThis link expires in 15 minutes. If you did not request it, ignore this email.`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#0F1615;">Sign in to Tall Karol CRM</h2>
        <p><a href="${link}" style="color:#006965;">Click here to sign in</a></p>
        <p style="color:#666;font-size:13px;">This link expires in 15 minutes. If you did not request it, ignore this email.</p>
      </div>
    `,
  })

  if (error) {
    console.error("Resend magic link error:", error)
  }

  return { ok: true as const }
}

export async function consumeMagicLink(token: string) {
  const tokenHash = hashToken(token)
  const now = new Date()

  const [row] = await db
    .select()
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.tokenHash, tokenHash),
        isNull(magicLinks.usedAt),
        gt(magicLinks.expiresAt, now)
      )
    )
    .limit(1)

  if (!row) return null
  if (!isAdminEmail(row.email)) return null

  await db
    .update(magicLinks)
    .set({ usedAt: now })
    .where(eq(magicLinks.id, row.id))

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, row.email))
    .limit(1)

  if (!user) {
    ;[user] = await db
      .insert(users)
      .values({ email: row.email, role: "admin" })
      .returning()
  } else if (user.role !== "admin") {
    ;[user] = await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, user.id))
      .returning()
  }

  const sessionToken = newToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt,
  })

  return { sessionToken, expiresAt, user }
}

export async function getSessionUser() {
  const jar = cookies()
  const raw = jar.get(SESSION_COOKIE)?.value
  if (!raw) return null

  const now = new Date()
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(eq(sessions.tokenHash, hashToken(raw)), gt(sessions.expiresAt, now))
    )
    .limit(1)

  if (!row) return null
  if (row.user.role !== "admin") return null
  return row.user
}

export async function destroySession() {
  const jar = cookies()
  const raw = jar.get(SESSION_COOKIE)?.value
  if (raw) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)))
  }
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  }
}
