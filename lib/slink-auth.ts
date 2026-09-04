import { cookies, headers } from "next/headers"
import { Resend } from "resend"
import { db } from "@/db"
import { issueToken, logEvent, type Executor } from "@/lib/slink-data"
import { SLINK_RULES } from "@/lib/slink"

/**
 * The recipient side of the door: the cookie, the request fingerprint, and the
 * email that carries a magic link.
 *
 * A recipient's cookie is deliberately not the admin session cookie. They are
 * different audiences with different lifetimes, and one should never be able to
 * stand in for the other.
 */

export const SLINK_COOKIE = "tk_slink"

/** Cookie lifetime matches the longest a session may live; the row still rules. */
const COOKIE_TTL_SEC = SLINK_RULES.maxSessionDays * 24 * 60 * 60

export function readSlinkCookie() {
  return cookies().get(SLINK_COOKIE)?.value
}

export function setSlinkCookie(token: string) {
  cookies().set(SLINK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_TTL_SEC,
  })
}

export function clearSlinkCookie() {
  cookies().delete(SLINK_COOKIE)
}

/** Who asked, for the audit trail. Never used to make a decision. */
export function requestFingerprint() {
  const h = headers()
  const forwarded = h.get("x-forwarded-for") ?? ""
  const ip = forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || ""
  return { ip: ip.slice(0, 90), userAgent: (h.get("user-agent") ?? "").slice(0, 300) }
}

/**
 * Headers every recipient-facing response carries.
 *
 * `no-store` keeps a shared machine's back button from re-rendering a
 * credential. `noindex` keeps a slink out of search. `no-referrer` is the one
 * that matters most: without it, any outbound click leaks the slink's URL to
 * the site being visited.
 */
export const SLINK_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const

function appUrl() {
  return (process.env.APP_URL || "https://crm.tallkarol.com").replace(/\/+$/, "")
}

export function slinkUrl(publicId: string) {
  return `${appUrl()}/slink/${publicId}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

type InviteInput = {
  slinkId: string
  publicId: string
  recipientId: string
  email: string
  title: string
  /** null when the grant never lapses. */
  expiresAt: Date | null
  fromName?: string
}

/**
 * Mint a fresh link and email it. The link is the credential, so it is never
 * logged and never stored — only its hash reaches the database.
 *
 * The email says the link is personal and offers the request-access path in the
 * same breath. If the honest route for "my colleague needs this too" is not one
 * click, people forward the link instead, which is the thing we are preventing.
 */
export async function sendMagicLink(input: InviteInput, client: Executor = db) {
  const token = await issueToken(input.recipientId, client)
  const url = `${slinkUrl(input.publicId)}/enter?token=${token}`
  const requestUrl = `${slinkUrl(input.publicId)}/request`
  const from = input.fromName || "Karol Buczek"

  const grantLine = input.expiresAt
    ? `Your access runs until ${input.expiresAt.toUTCString().replace(/ GMT$/, " UTC")}.`
    : "Your access does not expire."

  const key = process.env.RESEND_API_KEY
  const sender = process.env.RESEND_FROM_EMAIL || "hello@tallkarol.com"

  if (!key) {
    // No key in local development: the link still exists, it just is not posted.
    await logEvent(
      { slinkId: input.slinkId, recipientId: input.recipientId, kind: "link_sent", detail: "email skipped (no RESEND_API_KEY)" },
      client
    )
    return { sent: false as const, url }
  }

  const safeTitle = escapeHtml(input.title)
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;max-width:520px;color:#1F2C2B">
      <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#006965;font-weight:700;margin:0 0 18px">TALLKAROL</p>
      <h1 style="font-size:20px;margin:0 0 12px;color:#0F1615">${safeTitle}</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
        ${escapeHtml(from)} shared this with you. The button below signs you in on its own —
        there is no password to find.
      </p>
      <p style="margin:0 0 20px">
        <a href="${url}" style="display:inline-block;background:#006965;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px">Open it</a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#5D6B69;margin:0 0 20px">
        This button works for ${SLINK_RULES.tokenTtlMin} minutes. After that, ask for a fresh one
        with the same email address — the page itself is not going anywhere. ${escapeHtml(grantLine)}
      </p>
      <p style="font-size:12px;line-height:1.6;color:#8A9694;border-top:1px solid #EAE2D3;padding-top:16px;margin:0">
        This link is tied to <strong style="color:#5D6B69">${escapeHtml(input.email)}</strong> and will
        not work for anyone else, so please do not forward it. Somebody else needs access?
        <a href="${requestUrl}" style="color:#006965;font-weight:600">Request it for them</a> and
        ${escapeHtml(from)} will approve it.
      </p>
    </div>`

  const text = [
    `${input.title}`,
    ``,
    `${from} shared this with you. Open it here — the link signs you in, there is no password:`,
    url,
    ``,
    `The link works for ${SLINK_RULES.tokenTtlMin} minutes. After that, ask for a fresh one with the same email address; the page itself stays put. ${grantLine}`,
    ``,
    `This link is tied to ${input.email} and will not work for anyone else, so please do not forward it.`,
    `Somebody else needs access? Request it for them: ${requestUrl}`,
  ].join("\n")

  const resend = new Resend(key)
  const { error } = await resend.emails.send({
    from: `TALLKAROL <${sender}>`,
    to: input.email,
    subject: input.title,
    html,
    text,
  })
  if (error) throw new Error(`Could not send the link: ${error.message}`)

  await logEvent(
    { slinkId: input.slinkId, recipientId: input.recipientId, kind: "link_sent", detail: input.email },
    client
  )
  return { sent: true as const, url }
}
