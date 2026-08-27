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
