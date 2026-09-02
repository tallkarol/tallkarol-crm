import { createHash, randomBytes } from "crypto"

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString("hex")
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string) {
  return adminEmails().includes(email.trim().toLowerCase())
}

export const SESSION_COOKIE = "tk_crm_session"
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/**
 * How long the browser keeps the cookie. Deliberately longer than the row:
 * the row's expiry slides on use, so a session that is used stays alive and
 * one that is not dies server-side after SESSION_TTL_MS. The cookie only has
 * to outlive the row for that to work — a stale cookie just fails lookup.
 */
export const SESSION_COOKIE_TTL_MS = 365 * 24 * 60 * 60 * 1000
